/**
 * Закриття шкільного календаря й обрізання розкладу за ними.
 *
 * Вимоги: requirements/04-school-calendar.md (знімок 2026-11-18),
 * специфікація: openspec/specs/school-calendar/spec.md,
 * план: openspec/changes/impl-school-calendar/design.md.
 *
 * Тут лише чисті функції над даними — без бази й без React. Те саме правило
 * живе другою реалізацією в SQL (`private.working_minutes_on`): частку дня
 * рахує Postgres, тож знаменник балансу має знати про закриття теж. Третього
 * джерела правди немає, і кожну з двох реалізацій перевіряє свій тест.
 */

import { toMinutes, type ScheduleBlock } from "./schedule";

/**
 * Закриття школи: або цілі дні, або скорочений день.
 *
 * `endsOn` включно (припущення PM); для скороченого дня `startsOn` дорівнює
 * `endsOn`, а `closesAt` — час, з якого школа закрита до кінця доби.
 * Для закриття на цілі дні `closesAt` — `null`.
 */
export type Closure = {
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly closesAt: string | null;
};

/** Північ: з цього часу закрито цілий день. */
const MIDNIGHT = "00:00";

/**
 * Закриття, яке припадає на дату, або `null`.
 *
 * Дати порівнюємо як рядки: формат `YYYY-MM-DD` упорядкований лексикографічно
 * так само, як хронологічно, тож `Date` тут не потрібен — і не спокушає
 * місцевою часовою зоною.
 *
 * Два закриття не можуть мати спільної дати (`AC-CAL-11`), тож перше знайдене
 * і є єдиним; у базі це тримає обмеження на перетин діапазонів.
 */
export function closureOn(closures: readonly Closure[], date: string): Closure | null {
  return closures.find((c) => c.startsOn <= date && date <= c.endsOn) ?? null;
}

/** Чи закрите це закриття на цілий день (а не скорочений). */
export function isWholeDayClosure(closure: Closure): boolean {
  return closure.closesAt === null;
}

/**
 * Час, з якого дата закрита: `00:00` для цілого дня, `closesAt` для
 * скороченого. `null` — закриття немає, розклад не чіпаємо.
 */
export function closedFrom(closure: Closure | null): string | null {
  if (closure === null) return null;
  return closure.closesAt ?? MIDNIGHT;
}

/**
 * Блоки розкладу, що лишаються після закриття (`AC-CAL-04`).
 *
 * Правило PM: блок, що триває в час закриття, закінчується цим часом; блоки,
 * які починаються в цей час або пізніше, закриті. Блок, що закінчується рівно
 * в час закриття, лишається цілим — його кінець і так не включено в блок.
 *
 * Для закриття на цілий день (`00:00`) не лишається жодного блоку.
 *
 * Порожній результат сам по собі ще не каже, яке повідомлення побачить
 * працівник: вирішує `validateClosedDate`. PM відповів на `…spec#22`, що
 * скорочений день, який забрав **усі** блоки, — це закритий день із назвою
 * закриття (`AC-CAL-16`), а не «You have no working hours on this day», як ми
 * читали до відповіді.
 */
export function blocksAfterClosure(
  blocks: readonly ScheduleBlock[],
  from: string | null,
): ScheduleBlock[] {
  if (from === null) return [...blocks];

  const limit = toMinutes(from);
  const kept: ScheduleBlock[] = [];
  for (const block of blocks) {
    if (toMinutes(block.startsAt) >= limit) continue;
    kept.push(toMinutes(block.endsAt) > limit ? { ...block, endsAt: from } : block);
  }
  return kept;
}

/** Блоки дати після закриттів календаря — те, з чим далі працює заявка. */
export function blocksOnDate(
  blocks: readonly ScheduleBlock[],
  closures: readonly Closure[],
  date: string,
): ScheduleBlock[] {
  return blocksAfterClosure(blocks, closedFrom(closureOn(closures, date)));
}
