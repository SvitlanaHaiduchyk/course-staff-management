/**
 * Показ розкладу посади користувачеві.
 *
 * Це форматування для інтерфейсу, а не доменне правило: жоден AC не задає ні
 * порядку днів, ні роздільників. Доменні правила живуть у сусідніх модулях
 * `schedule.ts`, `validate.ts`, `build.ts` і `overlap.ts`.
 *
 * Навіщо окремий модуль: розклад показують дві сторінки — `/` і `/requests`
 * (основний сценарій вимоги `requirements/01-leave-request.md`, крок 2).
 */

/** Дні тижня: 1 — понеділок, 7 — неділя, як у `schedule_blocks.weekday`. */
export const WEEKDAYS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

/** Блок розкладу, як його повертає база: час у форматі `HH:MM:SS`. */
export type ScheduleBlockRow = {
  readonly weekday: number;
  readonly starts_at: string;
  readonly ends_at: string;
};

const hhmm = (time: string) => time.slice(0, 5);

/**
 * Тижневий розклад посади одним рядком:
 * `Пн 08:30–15:30 · Вт 08:30–12:00, 12:30–15:30`.
 *
 * Дні йдуть за порядком тижня, блоки всередині дня — за часом. Кілька блоків
 * одного дня показано через кому, щоб перерва всередині дня була видна
 * (випадок `AC-LEAVE-15`).
 */
export function scheduleSummary(blocks: readonly ScheduleBlockRow[]): string {
  const byDay = new Map<number, ScheduleBlockRow[]>();
  for (const block of blocks) {
    byDay.set(block.weekday, [...(byDay.get(block.weekday) ?? []), block]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekday, dayBlocks]) => {
      const hours = [...dayBlocks]
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((b) => `${hhmm(b.starts_at)}–${hhmm(b.ends_at)}`)
        .join(", ");
      return `${WEEKDAYS[weekday]} ${hours}`;
    })
    .join(" · ");
}
