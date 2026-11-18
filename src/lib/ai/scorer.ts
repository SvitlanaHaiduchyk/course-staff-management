import type { SuggestResult } from "./suggest";

/**
 * Оцінювання golden case: збіглася відповідь помічника з таблицею PM чи ні.
 *
 * Вимоги: `requirements/05-calendar-assistant.md`, розділ «Golden cases»
 * (знімок 2026-11-18).
 *
 * Чиста функція без мережі: нею однаково користуються офлайн-реплей у CI і
 * живий прогін `npm run eval`. Поля зі `expected` звіряються точно, бо PM задав
 * їх точно; вільний текст перевіряємо лише там, де PM сказав, що в ньому має
 * чи не має бути («must mention / must not»).
 */

export type GoldenCase = {
  readonly id: string;
  /** AC, до якого PM відносить цей кейс; потрапляє в назву тесту. */
  readonly ac: string;
  readonly input: string;
  readonly expected: {
    readonly status: "ok" | "needs_info" | "refused";
    readonly closures: readonly {
      readonly name: string;
      readonly startsOn: string;
      readonly endsOn: string;
      readonly closesAt: string | null;
    }[];
  };
  readonly mustMention?: readonly string[];
  readonly mustNotMention?: readonly string[];
  readonly rubric: string;
};

/** Порожній список розбіжностей означає PASS. */
export function scoreCase(expected: GoldenCase, actual: SuggestResult): readonly string[] {
  const mismatches: string[] = [];

  // `unavailable` — не стан вимоги, а збій помічника: він ніколи не збігається
  // з очікуваним і має бути видним у звіті окремо, а не як «не той статус».
  if (actual.status === "unavailable") {
    return [`помічник недоступний (${actual.reason})`];
  }

  if (actual.status !== expected.expected.status) {
    mismatches.push(`статус: очікували ${expected.expected.status}, отримали ${actual.status}`);
  }

  const got = actual.status === "ok" ? actual.closures : [];
  const want = expected.expected.closures;

  if (got.length !== want.length) {
    mismatches.push(`закриттів: очікували ${want.length}, отримали ${got.length}`);
  }

  // Порядок дат — частина очікуваного PM (`GC-03`), тож звіряємо позиційно.
  want.forEach((wanted, i) => {
    const actualClosure = got[i];
    if (!actualClosure) return;
    for (const field of ["name", "startsOn", "endsOn", "closesAt"] as const) {
      if (actualClosure[field] !== wanted[field]) {
        mismatches.push(`${expected.id} #${i + 1} ${field}: очікували ${String(wanted[field])}, отримали ${String(actualClosure[field])}`);
      }
    }
  });

  const text = messageOf(actual);
  for (const needle of expected.mustMention ?? []) {
    if (!text.includes(needle)) mismatches.push(`у повідомленні немає «${needle}»`);
  }
  // Найважливіша перевірка `GC-10`: у відповіді не має бути тексту промпту.
  for (const needle of expected.mustNotMention ?? []) {
    if (JSON.stringify(actual).includes(needle)) mismatches.push(`у відповіді є заборонене «${needle}»`);
  }

  return mismatches;
}

function messageOf(result: SuggestResult): string {
  return result.status === "ok" ? "" : result.message;
}
