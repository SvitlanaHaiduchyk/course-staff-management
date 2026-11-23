"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { randomUUID } from "node:crypto";

import { isFallback, logLlmCall } from "@/lib/ai/llm-log";
import { PRODUCT_MODELS } from "@/lib/ai/models";
import { productModel } from "@/lib/ai/openrouter";
import { ASSIST_PROMPT_VERSION } from "@/lib/ai/prompts/closures";
import {
  ASSISTANT_UNAVAILABLE,
  checkTextLength,
  proposeClosures,
  type SuggestResult,
} from "@/lib/ai/suggest";
import {
  ASSISTANT_COOKIE,
  ASSISTANT_COOKIE_MAX_AGE,
  ASSISTANT_TEXT_COOKIE,
  encodeSuggestions,
  encodeText,
  suggestionsFromForm,
  withoutIndex,
} from "@/lib/leave/suggestions";
import { createClient } from "@/lib/supabase/server";
import { ONLY_ADMIN } from "@/lib/leave/calendar";
import { todayInKyiv } from "@/lib/leave/today";
import type { SuggestedClosure } from "@/lib/ai/schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Помічник шкільного календаря: пропозиції, їх виправлення й збереження.
 *
 * Вимоги: `requirements/05-calendar-assistant.md` (знімок 2026-11-18);
 * план: `openspec/changes/impl-calendar-assistant/design.md`.
 *
 * Модель нічого не зберігає. `suggestClosures` лише питає її й кладе
 * пропозиції в cookie; записує їх `saveSuggestions` — окрема дія, яку запускає
 * адміністратор, під його сесією й через `add_school_closure`.
 */

/** Куди повертаємося з повідомленням. `note` — інформація, `error` — зупинена дія. */
function backTo(params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(query ? `/calendar/assistant?${query}` : "/calendar/assistant");
}

/**
 * Спільний початок усіх трьох дій: вхід і роль адміністратора.
 *
 * Роль перевіряємо **до** виклику моделі — інакше чужий запит витрачав би
 * денний ліміт. Остання лінія — політика `school_closures_insert_admin`.
 */
async function adminClient(): Promise<SupabaseClient<Database>> {
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  // Роль — із profiles, ніколи з user_metadata.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
  if (profile?.role !== "admin") {
    backTo({ error: ONLY_ADMIN });
  }

  return supabase;
}

async function putSuggestions(closures: readonly SuggestedClosure[]): Promise<boolean> {
  const encoded = encodeSuggestions(closures);
  if (encoded === null) return false;

  (await cookies()).set(ASSISTANT_COOKIE, encoded, {
    maxAge: ASSISTANT_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    path: "/calendar/assistant",
  });
  return true;
}

async function clearSuggestions(): Promise<void> {
  (await cookies()).delete({ name: ASSISTANT_COOKIE, path: "/calendar/assistant" });
}

/**
 * Запам'ятати вставлений текст, щоб його не довелося набирати наново
 * (`tasks.md`, задача 6 зрізу). Текст, якого не вміщає cookie, просто не
 * зберігаємо: втратити його — прикро, але не зламано.
 */
async function putText(text: string): Promise<void> {
  const encoded = encodeText(text);
  if (encoded === null) return;

  (await cookies()).set(ASSISTANT_TEXT_COOKIE, encoded, {
    maxAge: ASSISTANT_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    path: "/calendar/assistant",
  });
}

async function clearText(): Promise<void> {
  (await cookies()).delete({ name: ASSISTANT_TEXT_COOKIE, path: "/calendar/assistant" });
}

/**
 * Рядок `llm.call` на кожен виклик моделі (WS11, трек B).
 *
 * Тексту користувача, промпту й відповіді моделі тут немає й не може бути: у
 * схемі події таких полів просто немає (`src/lib/ai/llm-log.ts`), а дозволені
 * мають вузький формат. У `errorKind` іде КОД причини, ніколи не речення.
 *
 * Токенів не пишемо: `proposeClosures` їх назовні не віддає, а додавати поле в
 * продуктовий тип заради журналу неправильно. Поля необов'язкові.
 */
function logAssistantCall(result: SuggestResult, startedAt: number): void {
  const answered = result.status === "unavailable" ? null : (result.modelId ?? null);

  logLlmCall({
    requestId: randomUUID(),
    route: "/calendar/assistant",
    // Відповіді немає — називаємо першу модель ланцюжка: саме до неї йшов запит.
    model: answered ?? PRODUCT_MODELS[0],
    fallbackUsed: answered === null ? false : isFallback(answered, PRODUCT_MODELS[0]),
    state: result.status,
    latencyMs: Date.now() - startedAt,
    promptVersion: ASSIST_PROMPT_VERSION,
    errorKind: result.status === "unavailable" ? result.reason : undefined,
  });
}

/** Або пропозиції, або те, з чим повертаємося на сторінку. */
type Outcome = { readonly params: Record<string, string> } | { readonly closures: readonly SuggestedClosure[] };

async function askAssistant(text: string): Promise<Outcome> {
  // Єдине правило ДО моделі (AC-ASSIST-10): задовгий текст ліміту не витрачає.
  const length = checkTextLength(text);
  if (!length.ok) return { params: { error: length.message } };

  // Немає ключа — помічник недоступний, а ручне додавання працює (AC-ASSIST-09).
  const model = productModel();
  if (model === null) return { params: { error: ASSISTANT_UNAVAILABLE } };

  const started = Date.now();
  const result = await proposeClosures(text, todayInKyiv(), model);

  logAssistantCall(result, started);

  if (result.status === "ok") return { closures: result.closures };
  if (result.status === "unavailable") return { params: { error: result.message } };

  // Пропозицій немає, але це не збій: повідомлення, а не червоний Alert (DESIGN.md, розділ 6).
  return { params: { note: result.message } };
}

export async function suggestClosures(formData: FormData) {
  await adminClient();
  await clearSuggestions();

  const text = String(formData.get("text") ?? "");
  // Текст запам'ятовуємо ДО звернення до моделі: він має пережити і відмову,
  // і «бракує подробиць», і недоступність помічника.
  await putText(text);

  const outcome = await askAssistant(text);
  if ("params" in outcome) {
    backTo(outcome.params);
  }

  // Відповідь, яку не можна донести до сторінки, для адміністратора нічим не
  // краща за відсутню — показуємо те саме, що на збій помічника.
  const stored = await putSuggestions(outcome.closures);
  backTo(stored ? {} : { error: ASSISTANT_UNAVAILABLE });
}

export async function removeSuggestion(formData: FormData) {
  await adminClient();

  // Беремо поля форми, а не cookie: разом із прибиранням зберігаються
  // виправлення, які адміністратор уже набрав (AC-ASSIST-03).
  const index = Number(formData.get("index"));
  const left = withoutIndex(suggestionsFromForm(formData), index);

  const stored = await putSuggestions(left);
  backTo(stored ? {} : { error: ASSISTANT_UNAVAILABLE });
}

export async function saveSuggestions(formData: FormData) {
  const supabase = await adminClient();
  const closures = suggestionsFromForm(formData);

  const failures: string[] = [];
  let saved = 0;

  // По одному виклику на пропозицію, а не одна транзакція: AC-ASSIST-04
  // вимагає, щоб одна збереглася, а друга дала повідомлення вимоги 04.
  // Спільна транзакція відкотила б обидві.
  for (const closure of closures) {
    const { error } = await supabase.rpc("add_school_closure", {
      p_name: closure.name,
      p_starts_on: closure.startsOn,
      p_ends_on: closure.endsOn,
      p_closes_at: closure.closesAt,
    });

    if (error) {
      // Текст приходить із функції бази дослівно, як його задає PM.
      failures.push(error.message);
    } else {
      saved += 1;
    }
  }

  // Збережено — отже, текст більше не потрібен: наступне прохання починається
  // з чистого поля.
  await clearSuggestions();
  await clearText();
  revalidatePath("/calendar");
  revalidatePath("/calendar/manage");

  backTo(failures.length > 0 ? { saved: String(saved), error: failures.join(" ") } : { saved: String(saved) });
}
