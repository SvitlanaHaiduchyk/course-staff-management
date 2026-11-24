"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseClosureInput } from "@/lib/leave/closure-input";
import { createClient } from "@/lib/supabase/server";
import { reportDbError } from "@/lib/observability/report";

/**
 * Додавання й прибирання закриттів шкільного календаря.
 *
 * Вимоги: requirements/04-school-calendar.md (знімок 2026-11-18);
 * план: openspec/changes/impl-school-calendar/design.md.
 *
 * Правил тут немає: назву, порядок дат, перетини й блокувальні записи
 * перевіряє `public.add_school_closure`. Це навмисно — перевірка ще й тут
 * означала б два джерела правди, і одне з них відстало б. Дія лише передає
 * дані й показує текст, який повернула база.
 *
 * Розбір форми — у `parseClosureInput`: там дві речі, яких база не побачить
 * (скорочений день як одна дата й два тексти про порожні поля), і там їх
 * перевіряє тест.
 */

/** Куди повертаємося з повідомленням. */
function backTo(params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(query ? `/calendar/manage?${query}` : "/calendar/manage");
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

export async function addClosure(formData: FormData) {
  const supabase = await clientForAction();

  const parsed = parseClosureInput({
    name: String(formData.get("name") ?? ""),
    kind: String(formData.get("kind") ?? "whole"),
    startsOn: String(formData.get("startsOn") ?? ""),
    endsOn: String(formData.get("endsOn") ?? ""),
    closesAt: String(formData.get("closesAt") ?? ""),
  });

  if (!parsed.ok) {
    backTo({ error: parsed.message });
  }

  const { error } = await supabase.rpc("add_school_closure", parsed.input);

  if (error) {
    reportDbError(error, "add_school_closure");
    // Текст приходить із функції дослівно, як його задає PM (AC-CAL-07,
    // AC-CAL-10, AC-CAL-11, AC-CAL-17, AC-CAL-18, AC-CAL-19).
    backTo({ error: error.message });
  }

  revalidatePath("/calendar");
  revalidatePath("/calendar/manage");
  backTo({});
}

export async function removeClosure(formData: FormData) {
  const supabase = await clientForAction();

  // Прибирання — одна дія, функція не потрібна (AC-CAL-09). Право перевіряє
  // політика school_closures_delete_admin, а не ця дія.
  const { error } = await supabase
    .from("school_closures")
    .delete()
    .eq("id", String(formData.get("id") ?? ""));

  if (error) {
    reportDbError(error, "school_closures.delete");
    backTo({ error: error.message });
  }

  revalidatePath("/calendar");
  revalidatePath("/calendar/manage");
  backTo({});
}
