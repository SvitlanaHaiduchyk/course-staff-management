/**
 * Розклад посади й хвилини всередині його блоків.
 *
 * Вимоги: requirements/01-leave-request.md (знімок 2026-10-20),
 * специфікація: openspec/specs/leave-request/spec.md.
 *
 * Блок включає час початку й не включає час кінця: у блоці 08:30–13:00
 * найпізніший можливий початок відпустки — 12:55 (припущення PM).
 */

/** Блок робочого часу посади на день тижня. `weekday`: 1 — понеділок, 7 — неділя. */
export type ScheduleBlock = {
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
};

/** Проміжок часу в межах однієї дати. */
export type TimeRange = {
  readonly startsAt: string;
  readonly endsAt: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Хвилини від початку доби. Кидає на некоректному форматі — це помилка виклику, а не користувача. */
export function toMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new TypeError(`Час має бути у форматі HH:MM, отримано "${time}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Зворотне перетворення: 510 → "08:30". */
export function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * День тижня дати за ISO (1 — понеділок, 7 — неділя).
 * Дата — рядок `YYYY-MM-DD` у київському часі; усі дати продукту такі (припущення PM).
 */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Блоки розкладу посади на вказану дату, у порядку часу. Порожній масив — дата неробоча. */
export function scheduleFor(blocks: readonly ScheduleBlock[], date: string): ScheduleBlock[] {
  const weekday = weekdayOf(date);
  return blocks
    .filter((b) => b.weekday === weekday)
    .sort((a, b) => toMinutes(a.startsAt) - toMinutes(b.startsAt));
}

/**
 * Хвилини проміжку, що потрапляють усередину блоків розкладу.
 *
 * Заявка може перетинати перерву між блоками, але рахуються лише хвилини
 * всередині блоків: AC-LEAVE-15 (11:00–13:00 при блоках 08:30–12:00 і 12:30–15:30 → 90 хв).
 */
export function minutesInsideBlocks(blocks: readonly ScheduleBlock[], range: TimeRange): number {
  const from = toMinutes(range.startsAt);
  const to = toMinutes(range.endsAt);
  let total = 0;
  for (const block of blocks) {
    const blockFrom = toMinutes(block.startsAt);
    const blockTo = toMinutes(block.endsAt);
    const overlap = Math.min(to, blockTo) - Math.max(from, blockFrom);
    if (overlap > 0) total += overlap;
  }
  return total;
}

/** Усі робочі хвилини набору блоків — основа «цілого дня» посади (AC-LEAVE-01, AC-LEAVE-02). */
export function totalMinutes(blocks: readonly ScheduleBlock[]): number {
  return blocks.reduce((sum, b) => sum + (toMinutes(b.endsAt) - toMinutes(b.startsAt)), 0);
}

/** Проміжок «цілого дня» посади: від початку першого блоку до кінця останнього. */
export function wholeDayRange(blocks: readonly ScheduleBlock[]): TimeRange | null {
  if (blocks.length === 0) return null;
  return { startsAt: blocks[0].startsAt, endsAt: blocks[blocks.length - 1].endsAt };
}
