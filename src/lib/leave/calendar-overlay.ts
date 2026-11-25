/**
 * Особистий шар шкільного календаря: робочі дні людини та її відпустки.
 *
 * Навіщо він: шкільний календар за вимогами PM показує **спільні** закриття,
 * які створює адміністратор. Людина ж дивиться на рік, щоб зрозуміти свою
 * картину — коли школа зачинена, коли вона сама працює і коли в неї відпустка.
 * Жодного правила вимог це не змінює: закриття лишаються тим, чим були, а шар
 * додає те, що портал і так показує про людину на інших сторінках.
 *
 * Модуль чистий — жодних запитів: сторінка приносить рядки, тут лише
 * перетворення, яке перевіряє тест.
 */

import { weekdayOf } from "./week";

/** Блок розкладу так, як його віддає база. */
export type ScheduleBlock = { readonly weekday: number };

/** Посада з блоками розкладу. */
export type PositionBlocks = { readonly schedule_blocks?: readonly ScheduleBlock[] | null };

/** Запис відпустки так, як його віддає база, з типом із заявки. */
export type LeaveMark = {
  readonly on_date: string;
  readonly status: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly leave_type: string | null;
};

/**
 * Дні тижня, коли людина взагалі працює (1 — понеділок … 7 — неділя).
 *
 * Рахуємо по всіх посадах разом: вівторок у додатковій посаді робить вівторок
 * робочим, навіть якщо в головній його немає.
 */
export function workingWeekdays(positions: readonly PositionBlocks[]): ReadonlySet<number> {
  const days = new Set<number>();
  for (const position of positions) {
    for (const block of position.schedule_blocks ?? []) days.add(block.weekday);
  }
  return days;
}

/**
 * Чи працює людина цього дня за розкладом.
 *
 * Це про розклад, а не про календар: закриття школи й відпустка — окремі шари,
 * і вони накладаються поверх (`closureOnDate`, `leavesByDate`).
 */
export function worksOn(weekdays: ReadonlySet<number>, date: string): boolean {
  return weekdays.has(weekdayOf(date));
}

/**
 * Відпустки за датами. На одну дату може припасти кілька записів — по одному
 * на посаду (AC-LEAVE-02), тож значення — масив, а не один запис.
 */
export function leavesByDate(
  records: readonly LeaveMark[],
): ReadonlyMap<string, readonly LeaveMark[]> {
  const byDate = new Map<string, LeaveMark[]>();
  for (const record of records) {
    const day = byDate.get(record.on_date);
    if (day) day.push(record);
    else byDate.set(record.on_date, [record]);
  }
  return byDate;
}
