/**
 * Задача 1 зміни impl-leave: розклад посади й перевірка годин.
 *
 * Назви тестів починаються з AC ID — так їх знаходить npm run ac:coverage
 * і так PM порівнює реалізації розробників команди.
 */

import { describe, expect, it } from "vitest";

import {
  type ScheduleBlock,
  minutesInsideBlocks,
  scheduleFor,
  toMinutes,
  totalMinutes,
  weekdayOf,
  wholeDayRange,
} from "../src/lib/leave/schedule";
import {
  END_BEFORE_START,
  NO_WORKING_HOURS,
  endOfWorkingTimeMessage,
  outsideScheduleMessage,
  validateHours,
} from "../src/lib/leave/validate";

/** Пн–пт 08:30–15:30 — розклад основної посади з AC-LEAVE-01. */
const weekdays: ScheduleBlock[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startsAt: "08:30",
  endsAt: "15:30",
}));

/** Вт 08:30–12:00 і 12:30–15:30 — розклад із перервою з AC-LEAVE-15. */
const twoBlocksTue: ScheduleBlock[] = [
  { weekday: 2, startsAt: "08:30", endsAt: "12:00" },
  { weekday: 2, startsAt: "12:30", endsAt: "15:30" },
];

/** Блок 08:30–13:00 з AC-LEAVE-07 і AC-LEAVE-08 (понеділок). */
const singleBlockMon: ScheduleBlock[] = [{ weekday: 1, startsAt: "08:30", endsAt: "13:00" }];

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";
const SATURDAY = "2026-11-07";

describe("розклад посади", () => {
  it("AC-LEAVE-04: години в межах одного блоку дають тривалість 2 год 30 хв", () => {
    const blocks = scheduleFor(weekdays, MONDAY);
    const minutes = minutesInsideBlocks(blocks, { startsAt: "09:00", endsAt: "11:30" });

    expect(minutes).toBe(150);
  });

  it("AC-LEAVE-15: заявка через перерву рахує лише хвилини всередині блоків", () => {
    const blocks = scheduleFor(twoBlocksTue, TUESDAY);

    // 11:00–12:00 (60 хв) + 12:30–13:00 (30 хв); перерва 12:00–12:30 не рахується.
    const minutes = minutesInsideBlocks(blocks, { startsAt: "11:00", endsAt: "13:00" });

    expect(minutes).toBe(90);
  });

  it("AC-LEAVE-01: цілий день основної посади — це весь блок розкладу 08:30–15:30", () => {
    const blocks = scheduleFor(weekdays, MONDAY);

    expect(wholeDayRange(blocks)).toEqual({ startsAt: "08:30", endsAt: "15:30" });
    expect(totalMinutes(blocks)).toBe(420);
  });

  it("AC-LEAVE-15: цілий день за розкладом із двох блоків не рахує перерву", () => {
    const blocks = scheduleFor(twoBlocksTue, TUESDAY);

    expect(wholeDayRange(blocks)).toEqual({ startsAt: "08:30", endsAt: "15:30" });
    // 210 + 180 = 390 хвилин замість 420 за вирахуванням перерви 12:00–12:30.
    expect(totalMinutes(blocks)).toBe(390);
  });
});

describe("перевірка годин", () => {
  it("AC-LEAVE-06: дата без розкладу не приймається", () => {
    const blocks = scheduleFor(weekdays, SATURDAY);
    const result = validateHours(blocks, { startsAt: "09:00", endsAt: "11:00" });

    expect(blocks).toHaveLength(0);
    expect(result).toEqual({ ok: false, message: NO_WORKING_HOURS });
    expect(result.ok ? "" : result.message).toBe("You have no working hours on this day");
  });

  it("AC-LEAVE-07: початок раніший за розклад показує межі блоку", () => {
    const blocks = scheduleFor(singleBlockMon, MONDAY);
    const result = validateHours(blocks, { startsAt: "08:00", endsAt: "10:00" });

    expect(result).toEqual({
      ok: false,
      message: "Hours must be within your schedule: 08:30–13:00",
    });
  });

  it("AC-LEAVE-19: повідомлення перелічує всі блоки дня через кому", () => {
    const blocks = scheduleFor(twoBlocksTue, TUESDAY);
    const result = validateHours(blocks, { startsAt: "07:30", endsAt: "09:00" });

    expect(result).toEqual({
      ok: false,
      message: "Hours must be within your schedule: 08:30–12:00, 12:30–15:30",
    });
    expect(outsideScheduleMessage(blocks)).toContain("08:30–12:00, 12:30–15:30");
  });

  it("AC-LEAVE-08: початок, що дорівнює кінцю блоку, не приймається", () => {
    const blocks = scheduleFor(singleBlockMon, MONDAY);
    const result = validateHours(blocks, { startsAt: "13:00", endsAt: "14:00" });

    expect(result).toEqual({
      ok: false,
      message: "13:00 is the end of working time and can only be chosen as the end of leave",
    });
  });

  it("AC-LEAVE-20: початок на кінці першого блоку з двох не приймається", () => {
    const blocks = scheduleFor(twoBlocksTue, TUESDAY);
    const result = validateHours(blocks, { startsAt: "12:00", endsAt: "15:00" });

    // Саме повідомлення AC-LEAVE-08, а не загальне про межі розкладу: рішення PM на Q3.
    expect(result).toEqual({ ok: false, message: endOfWorkingTimeMessage("12:00") });
  });

  it("AC-LEAVE-09: кінець не пізніший за початок не приймається", () => {
    const blocks = scheduleFor(weekdays, MONDAY);
    const result = validateHours(blocks, { startsAt: "11:00", endsAt: "10:00" });

    expect(result).toEqual({ ok: false, message: END_BEFORE_START });
  });
});

describe("допоміжні перетворення", () => {
  it("AC-LEAVE-04: час переводиться у хвилини від початку доби", () => {
    expect(toMinutes("08:30")).toBe(510);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("23:55")).toBe(1435);
  });

  it("AC-LEAVE-06: день тижня визначається за датою в київському часі", () => {
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(weekdayOf(TUESDAY)).toBe(2);
    expect(weekdayOf(SATURDAY)).toBe(6);
  });
});
