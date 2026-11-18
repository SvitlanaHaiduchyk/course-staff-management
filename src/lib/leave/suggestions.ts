import { SuggestedClosureSchema, type SuggestedClosure } from "@/lib/ai/schema";

/**
 * Пропозиції помічника між двома діями адміністратора.
 *
 * Вимоги: `requirements/05-calendar-assistant.md` (знімок 2026-11-18);
 * план: `openspec/changes/impl-calendar-assistant/design.md`.
 *
 * **Чому cookie, а не таблиця.** До збереження пропозицій не існує ніде
 * (`AC-ASSIST-01`: «Nothing is saved yet»). Таблиця чернеток означала б нову
 * сутність, нову RLS і питання «коли її чистити». Cookie живе в браузері
 * адміністратора, зникає сама й не переживає перегляду.
 *
 * **Чому не стан клієнта.** Сторінка серверна, як і решта порталу: з
 * `useActionState` пропозиції існували б лише з увімкненим JavaScript, а без
 * нього форма мовчки нічого не показувала б. З cookie JavaScript потрібен лише
 * для напису «Preparing suggestions…» (`AC-ASSIST-08`).
 *
 * Тут лише чисті функції: саму cookie ставить і читає дія.
 */

export const ASSISTANT_COOKIE = "assistant";

/** Пів години: вистачає на перегляд, і чернетка не висить вічно. */
export const ASSISTANT_COOKIE_MAX_AGE = 60 * 30;

/**
 * Межа розміру cookie — 4096 байтів разом із назвою й атрибутами, тож беремо
 * із запасом. Десять пропозицій з назвами до 100 символів — близько 1,3 КБ.
 */
const MAX_ENCODED = 3500;

/**
 * Кодуємо в base64url: у JSON є коми, лапки й пробіли, яких cookie не любить,
 * а назва закриття приходить із вставленого тексту, тобто довіряти їй не можна.
 *
 * `null` означає «не вміщається»: відповідь, яку не можна донести до сторінки,
 * для адміністратора нічим не краща за відсутню.
 */
export function encodeSuggestions(closures: readonly SuggestedClosure[]): string | null {
  const encoded = Buffer.from(JSON.stringify(closures), "utf8").toString("base64url");
  return encoded.length > MAX_ENCODED ? null : encoded;
}

/** Будь-що зіпсоване — порожній список: cookie приходить із браузера, тобто це недовірені дані. */
export function decodeSuggestions(raw: string | undefined): readonly SuggestedClosure[] {
  if (!raw) return [];
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const parsed = SuggestedClosureSchema.array().safeParse(json);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/**
 * Пропозиції з полів форми — те, що адміністратор бачить зараз, із його
 * виправленнями (`AC-ASSIST-03`). Беремо саме їх, а не cookie: cookie відстала
 * б на всі зміни, які він щойно набрав.
 *
 * Порожній час закриття означає цілі дні; скорочений день завжди одна дата —
 * те саме тримає `school_closures_single_day_check` у базі.
 */
export function suggestionsFromForm(formData: FormData): readonly SuggestedClosure[] {
  const names = formData.getAll("name").map(String);
  const startsOn = formData.getAll("startsOn").map(String);
  const endsOn = formData.getAll("endsOn").map(String);
  const closesAt = formData.getAll("closesAt").map(String);

  return names.map((name, i) => {
    const start = (startsOn[i] ?? "").trim();
    const closes = (closesAt[i] ?? "").trim();
    return {
      name: name.trim(),
      startsOn: start,
      endsOn: closes === "" ? (endsOn[i] ?? "").trim() : start,
      closesAt: closes === "" ? null : closes,
    };
  });
}

/** Прибирання однієї пропозиції (`AC-ASSIST-03`). Чужий індекс нічого не змінює. */
export function withoutIndex(
  closures: readonly SuggestedClosure[],
  index: number,
): readonly SuggestedClosure[] {
  return closures.filter((_, i) => i !== index);
}
