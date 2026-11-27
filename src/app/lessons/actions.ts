"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLessonInput } from "@/lib/leave/lessons";
import { reportDbError } from "@/lib/observability/report";
import { createClient } from "@/lib/supabase/server";

/**
 * Додавання й прибирання занять (уроків, нарад). Обидві — для адміністратора.
 *
 * Вимог PM на заняття немає — рішення й межі в `docs/decisions/0004-lessons-as-a-layer.md`.
 * Жодна з цих дій не торкається `schedule_blocks` і не впливає на баланс.
 *
 * Роль тут не перевіряємо, і це навмисно: кому можна писати в `lessons`,
 * вирішують політики `lessons_insert_admin`, `lessons_update_admin` і
 * `lessons_delete_admin` через `private.current_app_role()`. Перевірка ще й тут
 * була б другим джерелом правди, і одне з них відстало б; сторінка ж свою
 * перевірку має, бо вона публічний GET. Дія лише розбирає форму — те, чого
 * база не побачить (порожні поля, порядок часу) — і передає рядок.
 */

/** Куди повертаємося з повідомленням. Ключ словника, а не готовий текст. */
function backTo(params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(query ? `/lessons?${query}` : "/lessons");
}

/** Спільний початок обох дій: без входу сторінка не працює. */
async function clientForAction() {
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }
  return supabase;
}

export async function addLesson(formData: FormData) {
  const supabase = await clientForAction();

  const parsed = parseLessonInput({
    positionId: String(formData.get("positionId") ?? ""),
    weekday: String(formData.get("weekday") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    form: String(formData.get("form") ?? ""),
  });

  if (!parsed.ok) {
    backTo({ error: parsed.messageKey });
  }

  const { error } = await supabase.from("lessons").insert(parsed.input);

  if (error) {
    reportDbError(error, "lessons.insert");
    // Текст бази людині не показуємо: він англійський, технічний і не є
    // дослівним текстом PM (на відміну від закриттів, де його задає функція).
    backTo({ error: "lessons.errSave" });
  }

  revalidatePath("/lessons");
  revalidatePath("/schedule");
  revalidatePath("/calendar");
  backTo({});
}

export async function removeLesson(formData: FormData) {
  const supabase = await clientForAction();

  // Прибирання — одна дія. Не адміністратор нічого не прибере: `lessons_delete_admin`
  // просто не знайде рядка, і база поверне «прибрано 0 рядків», а не помилку.
  const { error } = await supabase
    .from("lessons")
    .delete()
    .eq("id", String(formData.get("id") ?? ""));

  if (error) {
    reportDbError(error, "lessons.delete");
    backTo({ error: "lessons.errSave" });
  }

  revalidatePath("/lessons");
  revalidatePath("/schedule");
  revalidatePath("/calendar");
  backTo({});
}
