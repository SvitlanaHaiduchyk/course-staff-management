/**
 * День посади як перелік відрізків: заняття, відпустки, вільний робочий час і
 * перерви між блоками розкладу.
 *
 * Навіщо: тиждень більше не малюється смугами на шкалі годин. Замість цього
 * день — це блок посади, усередині якого підблоки йдуть один за одним, а час
 * написано словами. Причина зміни — обрізаний текст: у стовпці 60 px «Nature
 * study, 4-A» не вміщалося ніколи, а зробити стовпець ширшим і далі тримати
 * пропорційну висоту означало б сторінку заввишки в кілька екранів.
 *
 * Що втрачено, сказано прямо: тривалість більше не видно оком — урок на 45
 * хвилин і нарада на годину виглядають однаково. Тому проміжки й підписані
 * («11:15–13:00 вільно»): те, що раніше читалося з порожнечі, тепер читається
 * з тексту.
 *
 * Модуль чистий — жодних запитів і жодного React: сторінка приносить рядки,
 * тут лише перетворення, яке перевіряє тест. Доменних правил тут немає: межі
 * робочого часу задають `schedule_blocks`, і цей модуль їх лише переказує.
 */

import { hhmm, minutesOfTime } from "./week";

/** Будь-що, що займає частину дня: блок розкладу, заняття, запис відпустки. */
export type Span = {
  readonly starts_at: string;
  readonly ends_at: string;
};

/**
 * Відрізок дня.
 *
 * `entry` — те, що принесла сторінка (заняття чи відпустка): модуль не знає,
 * що саме, і не має знати. `free` — робочий час без занять усередині блоку,
 * `break` — проміжок МІЖ блоками розкладу, коли людина не працює взагалі.
 * Це різні речі, і плутати їх не можна: у перерву відпустку не беруть.
 */
export type DaySegment<T> =
  | { readonly kind: "entry"; readonly starts_at: string; readonly ends_at: string; readonly entry: T }
  | { readonly kind: "free" | "break"; readonly starts_at: string; readonly ends_at: string };

const byStart = (a: Span, b: Span) => minutesOfTime(a.starts_at) - minutesOfTime(b.starts_at);

/**
 * Відрізки дня для однієї посади, у порядку часу.
 *
 * Запис належить тому блоку, у якому ВПАВ ЙОГО ПОЧАТОК: запис, що переходить
 * через перерву (AC-LEAVE-15 таке дозволяє), показуємо один раз, а не двічі.
 * Вільний час рахуємо до початку наступного запису й після останнього —
 * порожній блок дає один відрізок «вільно» на всю свою довжину.
 */
export function daySegments<T extends Span>(
  blocks: readonly Span[],
  entries: readonly T[],
): DaySegment<T>[] {
  const ordered = [...blocks].sort(byStart);
  const pending = [...entries].sort(byStart);
  const out: DaySegment<T>[] = [];
  // `covered` — куди вже «дотягнувся» останній запис, `previousEnd` — де
  // скінчився попередній блок. Обидва переживають межу блоку, тож тримаємо їх
  // тут, а не всередині проходу.
  const state: Walk = { covered: null, previousEnd: null };

  for (const block of ordered) {
    if (state.previousEnd !== null && before(state.previousEnd, block.starts_at)) {
      out.push({ kind: "break", starts_at: state.previousEnd, ends_at: block.starts_at });
    }

    fillBlock(out, block, pending, state);
    state.previousEnd = block.ends_at;
  }

  return out;
}

/** Що треба пам'ятати між блоками одного дня. */
type Walk = { covered: string | null; previousEnd: string | null };

/**
 * Один блок розкладу: записи, що починаються в ньому, і вільний час навколо них.
 *
 * `covered` потрібен саме через межу блоку: запис 11:00–13:00 при блоках
 * 08:30–12:00 і 12:30–15:30 починається в першому, а закінчується в другому.
 * Без нього другий блок повідомив би «12:30–15:30 вільно» — тобто що людина
 * вільна тоді, коли вона у відпустці.
 */
function fillBlock<T extends Span>(
  out: DaySegment<T>[],
  block: Span,
  entries: readonly T[],
  state: Walk,
): void {
  let cursor =
    state.covered === null
      ? block.starts_at
      : later(block.starts_at, earlier(state.covered, block.ends_at));

  for (const entry of entries) {
    if (!startsInside(entry, block)) continue;

    if (before(cursor, entry.starts_at)) {
      out.push({ kind: "free", starts_at: cursor, ends_at: entry.starts_at });
    }
    out.push({ kind: "entry", starts_at: entry.starts_at, ends_at: entry.ends_at, entry });

    cursor = later(cursor, earlier(entry.ends_at, block.ends_at));
    state.covered = state.covered === null ? entry.ends_at : later(state.covered, entry.ends_at);
  }

  if (before(cursor, block.ends_at)) {
    out.push({ kind: "free", starts_at: cursor, ends_at: block.ends_at });
  }
}

function before(a: string, b: string): boolean {
  return minutesOfTime(a) < minutesOfTime(b);
}

function startsInside(entry: Span, block: Span): boolean {
  const start = minutesOfTime(entry.starts_at);
  return start >= minutesOfTime(block.starts_at) && start < minutesOfTime(block.ends_at);
}

function later(a: string, b: string): string {
  return minutesOfTime(a) >= minutesOfTime(b) ? a : b;
}

function earlier(a: string, b: string): string {
  return minutesOfTime(a) <= minutesOfTime(b) ? a : b;
}

/**
 * Години посади цього дня рядком: `08:30–12:00, 12:30–15:30`.
 *
 * Перелічуємо КОЖЕН блок, а не загальний проміжок від першого до останнього:
 * «08:30–15:30» на день із перервою сказало б, що людина працює й о 12:15.
 */
export function hoursLabel(blocks: readonly Span[]): string {
  return [...blocks]
    .sort(byStart)
    .map((block) => `${hhmm(block.starts_at)}–${hhmm(block.ends_at)}`)
    .join(", ");
}

/** Проміжок часу рядком: `11:15–13:00`. */
export function spanLabel(span: Span): string {
  return `${hhmm(span.starts_at)}–${hhmm(span.ends_at)}`;
}
