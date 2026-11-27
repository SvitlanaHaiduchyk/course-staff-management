/**
 * Тижневий вигляд розкладу: дати, межі тижня й підписи.
 *
 * Це форматування для інтерфейсу, а не доменне правило — як і `format.ts`.
 * Жоден AC не задає, який саме тиждень показано: PM вимагає лише, щоб тип
 * відпустки й статус були текстом (…spec#14). Доменні правила — у
 * `schedule.ts`, `validate.ts`, `build.ts` і `overlap.ts`.
 *
 * Геометрії тут більше немає. `hourWindow`, `geometryOf`, `tickPercent`,
 * `hourTicks` і `assignLanes` малювали смуги на пропорційній шкалі годин;
 * відколи тиждень — це блоки посад із підблоками занять (`day-plan.ts`),
 * їх не кликав ніхто, і тримати мертвий код «про всяк випадок» не варто:
 * історія в git нікуди не поділася.
 *
 * Дати всюди — рядки `YYYY-MM-DD`, арифметика через `Date.UTC`: місцевий час
 * на сервері й у браузері різний, а `on_date` у базі — календарний день без
 * часової зони. Рахувати його локальним `new Date("2026-11-03")` означає
 * з'їхати на добу на півкулі із від'ємним зміщенням.
 */

/** Хвилини від півночі з `HH:MM` або `HH:MM:SS`. */
export function minutesOfTime(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** `HH:MM` із часу бази (`08:00:00` → `08:00`). */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

function toUtc(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** День тижня дати: 1 — понеділок … 7 — неділя (як `schedule_blocks.weekday`). */
export function weekdayOf(isoDate: string): number {
  return toUtc(isoDate).getUTCDay() || 7;
}

/** Понеділок того тижня, у який потрапляє дата. */
export function mondayOf(isoDate: string): string {
  const date = toUtc(isoDate);
  date.setUTCDate(date.getUTCDate() - (weekdayOf(isoDate) - 1));
  return toIso(date);
}

/** Той самий день через `weeks` тижнів (від'ємне значення — назад). */
export function shiftWeeks(isoDate: string, weeks: number): string {
  const date = toUtc(isoDate);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return toIso(date);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Понеділок тижня, який показуємо: з параметра адреси, якщо він схожий на дату,
 * інакше поточний. Невалідне значення мовчки замінюємо на сьогодні — це навігація,
 * а не введення даних, і сторінка з кривим `?week=` має просто показати цей тиждень.
 */
export function resolveMonday(week: string | string[] | undefined, todayIso: string): string {
  return mondayOf(typeof week === "string" && ISO_DATE.test(week) ? week : todayIso);
}

/** Сім дат тижня, від понеділка. */
export function weekDates(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftDays(mondayIso, index));
}

function shiftDays(isoDate: string, days: number): string {
  const date = toUtc(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Число місяця для шапки стовпця: `3`. */
export function dayNumber(isoDate: string): string {
  return String(toUtc(isoDate).getUTCDate());
}

const rangeFormat = (locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Підпис тижня: `3 – 9 листопада 2026`. Місяць пишемо один раз, якщо тиждень
 * не переходить через його межу, — інакше `30 листопада – 6 грудня 2026`.
 *
 * Локаль передає сторінка: назва місяця має бути тією ж мовою, що й решта
 * інтерфейсу, а модуль про вибір мови нічого не знає.
 */
export function weekRangeLabel(mondayIso: string, locale: string): string {
  const format = rangeFormat(locale);
  const sunday = shiftDays(mondayIso, 6);
  const year = toUtc(sunday).getUTCFullYear();
  const sameMonth = mondayIso.slice(0, 7) === sunday.slice(0, 7);
  const from = sameMonth ? dayNumber(mondayIso) : format.format(toUtc(mondayIso));
  return `${from} – ${format.format(toUtc(sunday))} ${year}`;
}
