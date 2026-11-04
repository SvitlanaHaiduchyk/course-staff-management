/**
 * Тижневий вигляд розкладу: геометрія й підписи.
 *
 * Це форматування для інтерфейсу, а не доменне правило — як і `format.ts`.
 * Жоден AC не задає ні того, який тиждень показано, ні висоти смуги: PM вимагає
 * лише, щоб тип відпустки й статус були текстом (…spec#14). Доменні правила —
 * у `schedule.ts`, `validate.ts`, `build.ts` і `overlap.ts`.
 *
 * Дати всюди — рядки `YYYY-MM-DD`, арифметика через `Date.UTC`: місцевий час
 * на сервері й у браузері різний, а `on_date` у базі — календарний день без
 * часової зони. Рахувати його локальним `new Date("2026-11-03")` означає
 * з'їхати на добу на півкулі із від'ємним зміщенням.
 */

/** Скільки годин лишаємо над найранішим і під найпізнішим блоком, щоб було видно межі дня. */
const PADDING_HOURS = 1;

/** Вікно за замовчуванням, коли жодного блока немає: звичайний шкільний день. */
const DEFAULT_WINDOW = { fromHour: 8, toHour: 17 } as const;

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

/** Вікно годин, яке показує сітка. */
export type HourWindow = { readonly fromHour: number; readonly toHour: number };

/**
 * Межі сітки за найранішим і найпізнішим блоком тижня, з годиною запасу з обох
 * боків. Без запасу смуги впираються в краї картки, і сітка перестає читатись
 * як доба: видно прямокутники, а не години.
 */
export function hourWindow(times: readonly { starts_at: string; ends_at: string }[]): HourWindow {
  if (times.length === 0) return DEFAULT_WINDOW;

  const starts = times.map((t) => minutesOfTime(t.starts_at));
  const ends = times.map((t) => minutesOfTime(t.ends_at));
  const fromHour = Math.max(0, Math.floor(Math.min(...starts) / 60) - PADDING_HOURS);
  const toHour = Math.min(24, Math.ceil(Math.max(...ends) / 60) + PADDING_HOURS);
  return { fromHour, toHour: Math.max(toHour, fromHour + 1) };
}

/** Години, за якими підписано шкалу: від `fromHour` до `toHour` включно. */
export function hourTicks({ fromHour, toHour }: HourWindow): number[] {
  return Array.from({ length: toHour - fromHour + 1 }, (_, index) => fromHour + index);
}

/** Частка висоти сітки у відсотках: де смуга починається і яка вона заввишки. */
export type Geometry = { readonly topPercent: number; readonly heightPercent: number };

/**
 * Положення смуги у стовпці дня. Усе за межами вікна обрізаємо, а не ховаємо:
 * блок, що вийшов за шкалу, має лишитися видимим хоча б краєм.
 */
export function geometryOf(
  span: { starts_at: string; ends_at: string },
  { fromHour, toHour }: HourWindow,
): Geometry {
  const total = (toHour - fromHour) * 60;
  const start = clamp(minutesOfTime(span.starts_at) - fromHour * 60, 0, total);
  const end = clamp(minutesOfTime(span.ends_at) - fromHour * 60, 0, total);
  return {
    topPercent: (start / total) * 100,
    heightPercent: (Math.max(end - start, 0) / total) * 100,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Частка години у відсотках висоти — для ліній шкали. */
export function tickPercent(hour: number, { fromHour, toHour }: HourWindow): number {
  return ((hour - fromHour) / (toHour - fromHour)) * 100;
}

/** Смуга з доріжкою: `lane` — який стовпчик усередині дня, `lanes` — скільки їх усього. */
export type Laned<T> = T & { readonly lane: number; readonly lanes: number };

/**
 * Доріжки для смуг одного дня: дві посади можуть працювати в ті самі години
 * (`AC-LEAVE-02` — заявка на дві посади), і накладені одна на одну смуги сховали б
 * одну з них. Жадібно садимо кожну смугу в першу вільну доріжку.
 */
export function assignLanes<T extends { starts_at: string; ends_at: string }>(
  spans: readonly T[],
): Laned<T>[] {
  const sorted = [...spans].sort(
    (a, b) => minutesOfTime(a.starts_at) - minutesOfTime(b.starts_at),
  );
  const laneEnds: number[] = [];
  const placed = sorted.map((span) => {
    const start = minutesOfTime(span.starts_at);
    const end = minutesOfTime(span.ends_at);
    const lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    const index = lane === -1 ? laneEnds.length : lane;
    laneEnds[index] = end;
    return { ...span, lane: index };
  });
  return placed.map((span) => ({ ...span, lanes: laneEnds.length }));
}
