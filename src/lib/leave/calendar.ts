/**
 * Шкільний календар: межі навчального року й показ закриттів.
 *
 * Вимоги: requirements/04-school-calendar.md (знімок 2026-11-18),
 * специфікація: openspec/specs/school-calendar/spec.md,
 * план: openspec/changes/impl-school-calendar/design.md.
 *
 * Чисті функції над даними — без бази й без React, щоб межі навчального року
 * можна було перевірити тестом, а не клацанням по сторінці.
 */

/** Закриття так, як його віддає база. */
export type ClosureRow = {
  readonly id: string;
  readonly name: string;
  readonly starts_on: string;
  readonly ends_on: string;
  readonly closes_at: string | null;
};

/**
 * Межі навчального року: 1 вересня — 31 серпня (припущення PM).
 *
 * Дати рахуємо рядками, а не через `Date`: формат `YYYY-MM-DD` упорядкований
 * лексикографічно так само, як хронологічно, і місцева часова зона на нього
 * не впливає. Та сама причина, що й у `closure.ts`.
 */
export function schoolYearRange(year: number): { from: string; to: string } {
  return { from: `${year}-09-01`, to: `${year + 1}-08-31` };
}

/** Підпис року для заголовка й порожнього стану: «2026–2027». */
export function schoolYearLabel(year: number): string {
  return `${year}–${year + 1}`;
}

/**
 * AC-CAL-15: рік без закриттів має власний текст.
 *
 * Дослівно з AC, англійською в обох мовах інтерфейсу — як статуси й типи
 * відпустки.
 */
export function noClosuresMessage(year: number): string {
  return `No closed days in school year ${schoolYearLabel(year)}`;
}

/**
 * Закриття, видимі в навчальному році, у порядку дат.
 *
 * Припущення PM: закриття на цілі дні, що перетинає 31 серпня, показують в
 * **обох** навчальних роках. Тому умова — перетин діапазонів, а не входження
 * цілком: закриття лишається в переліку, якщо хоч один його день належить
 * рокові.
 */
export function closuresOfSchoolYear(
  closures: readonly ClosureRow[],
  year: number,
): ClosureRow[] {
  const { from, to } = schoolYearRange(year);
  return closures
    .filter((c) => c.starts_on <= to && from <= c.ends_on)
    .sort((a, b) => (a.starts_on < b.starts_on ? -1 : a.starts_on > b.starts_on ? 1 : 0));
}

/**
 * Дати закриття текстом: одна дата, діапазон або дата з часом.
 *
 * Вид закриття пишемо **словом**, а не лише іконкою: правило дизайн-системи
 * про текст поряд із кольором тут не застосовне (статусів немає), але та сама
 * думка діє — значення не можна передавати самим лише виглядом.
 */
export function closureDatesLabel(closure: ClosureRow, fromTime: string): string {
  if (closure.closes_at !== null) {
    return `${closure.starts_on}, ${fromTime} ${closure.closes_at.slice(0, 5)}`;
  }
  if (closure.starts_on === closure.ends_on) return closure.starts_on;
  return `${closure.starts_on} – ${closure.ends_on}`;
}

/**
 * Навчальний рік із адреси (`?year=`) або поточний.
 *
 * Окремою функцією, щоб відмову на сміття перевіряв тест, а не клацання по
 * сторінці: `Number("")` дає 0, `Number("abc")` — NaN, і обидва мали б
 * показати поточний рік, а не 0-й чи порожню сторінку.
 *
 * Межі 2000–2100 — наша, а не PM: вимоги меж не задають, але без них адреса
 * `?year=999999` дала б підпис «999999–1000000» і порожній рік назавжди.
 */
export function parseSchoolYear(param: string | undefined, current: number): number {
  if (param === undefined) return current;
  const parsed = Number(param);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) return current;
  return parsed;
}
