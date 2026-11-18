/**
 * Перевірка годин заявки проти розкладу посади.
 *
 * Тексти повідомлень — дослівно з тексту PM (requirements/01-leave-request.md,
 * знімок 2026-10-20), разом із тире «–»: тести звіряють їх посимвольно.
 */

import { isWholeDayClosure, type Closure } from "./closure";
import { type ScheduleBlock, type TimeRange, toMinutes } from "./schedule";

export type HoursCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const OK: HoursCheck = { ok: true };

/** AC-LEAVE-06: дата, на яку посада не має жодного блоку розкладу. */
export const NO_WORKING_HOURS = "You have no working hours on this day";

/** AC-LEAVE-09: кінець не пізніший за початок. */
export const END_BEFORE_START = "The end must be later than the start";

/** AC-CAL-03, AC-CAL-16: дата, закрита шкільним календарем. */
export function schoolClosedMessage(name: string): string {
  return `The school is closed on this day: ${name}`;
}

/**
 * AC-CAL-03, AC-CAL-16: чи приймається дата, на яку припадає закриття.
 *
 * Дата не приймається у двох випадках:
 *
 * • закриття на **цілий день** (`AC-CAL-03`);
 * • **скорочений день, що не лишив жодного блоку** розкладу цього працівника
 *   до часу закриття (`AC-CAL-16`).
 *
 * Другий випадок додав PM у відповідь на `…spec#22`. До відповіді ми читали
 * інакше: обрізання лишає нуль блоків, далі спрацьовує «Дата без розкладу не
 * приймається», і працівник бачить «You have no working hours on this day».
 * Прочитання було правдоподібним і хибним — PM вирішив, що це закритий день,
 * і повідомлення має називати закриття.
 *
 * Саме тому `blocksLeft` — обов'язковий аргумент, а не значення за
 * замовчуванням: виклик без нього мовчки повернув би стару поведінку для
 * скороченого дня, а тип тепер цього не дозволяє.
 *
 * Межа: якщо хоч один блок до часу закриття лишився, дата **приймається** з
 * обрізаним розкладом (`AC-CAL-04`), і це правило не спрацьовує.
 *
 * Перевірка окрема від `validateHours`, бо вона про дату, а не про години: у
 * заявці на кілька дат закрита дата відпадає зі своїм повідомленням, а решта
 * дат створюється — як дата без робочих годин (`AC-LEAVE-21`).
 */
export function validateClosedDate(
  closure: Closure | null,
  blocksLeft: readonly ScheduleBlock[],
): HoursCheck {
  if (closure === null) return OK;
  if (isWholeDayClosure(closure) || blocksLeft.length === 0) {
    return { ok: false, message: schoolClosedMessage(closure.name) };
  }
  return OK;
}

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
 * Чи дорівнює час початку якогось блоку дня.
 *
 * `AC-LEAVE-22`: кінець відпустки може дорівнювати початку наступного блоку.
 * Блок, що починається рівно на `minute`, завжди і є «наступним»: початок
 * відпустки лежить усередині якогось блоку, блоки не перетинаються, тож жодна
 * врахована хвилина в цей блок не потрапляє.
 */
function isBlockStart(blocks: readonly ScheduleBlock[], minute: number): boolean {
  return blocks.some((b) => toMinutes(b.startsAt) === minute);
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

  // Початок має потрапляти в блок; кінець — бути всередині блоку, дорівнювати
  // кінцю блоку (AC-LEAVE-04) або початку наступного блоку (AC-LEAVE-22).
  const startInside = insideSomeBlock(blocks, from);
  const endInside =
    insideSomeBlock(blocks, to - 1) || isBlockEnd(blocks, to) || isBlockStart(blocks, to);
  if (!startInside || !endInside) {
    return { ok: false, message: outsideScheduleMessage(blocks) };
  }

  return OK;
}
