/**
 * Показ розкладу посади. Жоден AC не задає формату цього рядка, тож назви тестів
 * тут без AC ID: `npm run ac:coverage` їх і не рахує як покриття.
 */

import { describe, expect, it } from "vitest";

import {
  type ScheduleBlockRow,
  leaveTypeLabel,
  scheduleSummary,
} from "../src/lib/leave/format";

/** Назви днів передає сторінка; у тестах беремо українські — їх і перевіряємо. */
const DAYS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

const block = (weekday: number, starts: string, ends: string): ScheduleBlockRow => ({
  weekday,
  starts_at: `${starts}:00`,
  ends_at: `${ends}:00`,
});

describe("розклад рядком", () => {
  it("показує один блок дня з днем тижня", () => {
    expect(scheduleSummary([block(1, "08:30", "15:30")], DAYS)).toBe("Пн 08:30–15:30");
  });

  it("показує обидва блоки дня через кому, щоб перерва була видна", () => {
    const summary = scheduleSummary([block(2, "08:30", "12:00"), block(2, "12:30", "15:30")], DAYS);

    expect(summary).toBe("Вт 08:30–12:00, 12:30–15:30");
  });

  it("упорядковує дні за тижнем, а блоки — за часом", () => {
    const summary = scheduleSummary([
      block(3, "08:30", "15:30"),
      block(1, "12:30", "15:30"),
      block(1, "08:30", "12:00"),
    ], DAYS);

    expect(summary).toBe("Пн 08:30–12:00, 12:30–15:30 · Ср 08:30–15:30");
  });

  it("порожній розклад дає порожній рядок", () => {
    expect(scheduleSummary([], DAYS)).toBe("");
  });
});

describe("тип відпустки", () => {
  it("тип показується назвою, а не ідентифікатором бази", () => {
    expect(leaveTypeLabel("sick")).toBe("Sick leave");
    expect(leaveTypeLabel("family_celebration")).toBe("Family celebration");
  });

  it("невідомий тип не показує сирого рядка з бази", () => {
    expect(leaveTypeLabel("whatever")).toBe("—");
  });

  it("порожній тип теж дає прочерк", () => {
    expect(leaveTypeLabel(null)).toBe("—");
    expect(leaveTypeLabel(undefined)).toBe("—");
  });
});
