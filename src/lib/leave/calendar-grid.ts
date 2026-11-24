/**
 * Сітка навчального року для `/calendar`: дванадцять місяців із позначеними
 * закритими днями.
 *
 * Чому сітка взагалі: вимоги PM кажуть лише «календар показує назву й дати»
 * (AC-CAL-01, AC-CAL-02), і перелік це виконує — але слово «календар» людина
 * читає як сітку, а не як список із трьох рядків. Жодного правила тут не
 * вигадано: сітка показує ті самі закриття, що й перелік, а перелік лишається
 * під нею — у ньому живуть дослівні тексти AC.
 *
 * Дати — рядками `YYYY-MM-DD`, як і в решті модулів: такий формат
 * упорядкований лексикографічно так само, як хронологічно, і місцева часова
 * зона на нього не впливає.
 */

import type { ClosureRow } from "./calendar";
import { weekdayOf } from "./week";

/** Місяць сітки. `month` — 1…12, як у людей, а не 0…11, як у `Date`. */
export type MonthKey = { readonly year: number; readonly month: number };

/** Скільки місяців показуємо: вересень поточного року — серпень наступного. */
const MONTHS_IN_SCHOOL_YEAR = 12;
/** Навчальний рік починається у вересні (припущення PM, `schoolYearRange`). */
const FIRST_MONTH = 9;

/**
 * Дванадцять місяців навчального року, від вересня до серпня.
 *
 * Межі ті самі, що в `schoolYearRange`: рік 2026 — це 2026-09-01 … 2027-08-31.
 */
export function monthsOfSchoolYear(year: number): readonly MonthKey[] {
  return Array.from({ length: MONTHS_IN_SCHOOL_YEAR }, (_, index) => {
    const raw = FIRST_MONTH + index;
    return raw <= 12 ? { year, month: raw } : { year: year + 1, month: raw - 12 };
  });
}

/** Скільки днів у місяці (нульовий день наступного місяця — останній цього). */
export function daysInMonth({ year, month }: MonthKey): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Усі дати місяця рядками, у порядку зростання. */
export function monthDates(key: MonthKey): readonly string[] {
  const month = String(key.month).padStart(2, "0");
  return Array.from(
    { length: daysInMonth(key) },
    (_, index) => `${key.year}-${month}-${String(index + 1).padStart(2, "0")}`,
  );
}

/**
 * Скільки порожніх клітинок поставити перед першим числом.
 *
 * Тиждень починається з понеділка — як у «Моєму розкладі» й як звично тут.
 */
export function leadingBlanks(key: MonthKey): number {
  return weekdayOf(monthDates(key)[0]) - 1;
}

/**
 * Закриття, що накриває цю дату, або `null`.
 *
 * Два закриття не можуть мати спільної дати (`AC-CAL-11`, обмеження на перетин
 * у базі), тож перше знайдене і є єдиним.
 */
export function closureOnDate(
  closures: readonly ClosureRow[],
  date: string,
): ClosureRow | null {
  return closures.find((c) => c.starts_on <= date && date <= c.ends_on) ?? null;
}

/** Підпис місяця мовою інтерфейсу: «вересень 2026» / «September 2026». */
export function monthLabel({ year, month }: MonthKey, locale: string): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Дата словами: «20 листопада 2026 р.» / «20 November 2026». */
export function longDate(date: string, locale: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
