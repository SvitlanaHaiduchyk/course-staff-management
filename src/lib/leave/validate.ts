/**
 * Перевірка годин заявки проти розкладу посади.
 *
 * Тексти повідомлень — дослівно з тексту PM (requirements/01-leave-request.md,
 * знімок 2026-10-20), разом із тире «–»: тести звіряють їх посимвольно.
 */

import { type ScheduleBlock, type TimeRange, toMinutes } from "./schedule";

export type HoursCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const OK: HoursCheck = { ok: true };

/** AC-LEAVE-06: дата, на яку посада не має жодного блоку розкладу. */
export const NO_WORKING_HOURS = "You have no working hours on this day";

/** AC-LEAVE-09: кінець не пізніший за початок. */
export const END_BEFORE_START = "The end must be later than the start";

/**
 * AC-LEAVE-07, AC-LEAVE-19: години поза розкладом.
 * Повідомлення перелічує всі блоки дня через «, » у порядку часу (припущення PM, знімок 2026-10-20).
 */
export function outsideScheduleMessage(blocks: readonly ScheduleBlock[]): string {
  const list = blocks.map((b) => `${b.startsAt}–${b.endsAt}`).join(", ");
  return `Hours must be within your schedule: ${list}`;
}

/** AC-LEAVE-08, AC-LEAVE-20: початок дорівнює кінцю блоку. */
export function endOfWorkingTimeMessage(time: string): string {
  return `${time} is the end of working time and can only be chosen as the end of leave`;
}

/** Чи належить хвилина якомусь блоку: початок включно, кінець виключно. */
function insideSomeBlock(blocks: readonly ScheduleBlock[], minute: number): boolean {
  return blocks.some((b) => minute >= toMinutes(b.startsAt) && minute < toMinutes(b.endsAt));
}

/** Чи дорівнює час кінцю якогось блоку дня. */
function isBlockEnd(blocks: readonly ScheduleBlock[], minute: number): boolean {
  return blocks.some((b) => toMinutes(b.endsAt) === minute);
}

/**
 * Перевіряє години заявки для однієї посади на одну дату.
 *
 * Порядок перевірок задає, яке саме повідомлення побачить працівник, і він важливий:
 * початок на кінці блоку має дати повідомлення AC-LEAVE-08, а не загальне AC-LEAVE-07
 * (рішення PM на питання Q3, …spec#5).
 */
export function validateHours(blocks: readonly ScheduleBlock[], range: TimeRange): HoursCheck {
  if (blocks.length === 0) return { ok: false, message: NO_WORKING_HOURS };

  const from = toMinutes(range.startsAt);
  const to = toMinutes(range.endsAt);

  if (to <= from) return { ok: false, message: END_BEFORE_START };

  // AC-LEAVE-08, AC-LEAVE-20: кінець робочого часу може бути лише кінцем відпустки.
  if (isBlockEnd(blocks, from)) {
    return { ok: false, message: endOfWorkingTimeMessage(range.startsAt) };
  }

  // Початок і кінець мають кожен потрапляти в блок; кінець може дорівнювати кінцю блоку.
  const startInside = insideSomeBlock(blocks, from);
  const endInside = insideSomeBlock(blocks, to - 1) || isBlockEnd(blocks, to);
  if (!startInside || !endInside) {
    return { ok: false, message: outsideScheduleMessage(blocks) };
  }

  return OK;
}
