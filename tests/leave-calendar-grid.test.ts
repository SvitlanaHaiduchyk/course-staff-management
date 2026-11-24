// Сітка навчального року для /calendar: порядок місяців, довжина місяця,
// зсув першого тижня й пошук закриття за датою. Дані лише синтетичні.

import { describe, expect, it } from "vitest";

import type { ClosureRow } from "../src/lib/leave/calendar";
import {
  closureOnDate,
  daysInMonth,
  leadingBlanks,
  monthDates,
  monthLabel,
  monthsOfSchoolYear,
} from "../src/lib/leave/calendar-grid";

const WINTER: ClosureRow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Winter break",
  starts_on: "2026-12-28",
  ends_on: "2027-01-08",
  closes_at: null,
};

describe("monthsOfSchoolYear", () => {
  it("рік починається вереснем і закінчується серпнем наступного", () => {
    const months = monthsOfSchoolYear(2026);

    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2026, month: 9 });
    expect(months[3]).toEqual({ year: 2026, month: 12 });
    expect(months[4]).toEqual({ year: 2027, month: 1 });
    expect(months[11]).toEqual({ year: 2027, month: 8 });
  });
});

describe("daysInMonth", () => {
  it("рахує довжину звичайних місяців", () => {
    expect(daysInMonth({ year: 2026, month: 9 })).toBe(30);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });

  it("лютий високосного року має 29 днів", () => {
    // Навчальний рік 2027–2028 накриває лютий 2028 — він високосний.
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2027, month: 2 })).toBe(28);
  });
});

describe("monthDates", () => {
  it("віддає всі дати місяця з нулями в однозначних числах", () => {
    const dates = monthDates({ year: 2026, month: 9 });

    expect(dates[0]).toBe("2026-09-01");
    expect(dates.at(-1)).toBe("2026-09-30");
    expect(dates).toHaveLength(30);
  });
});

describe("leadingBlanks", () => {
  it("зсуває перше число під потрібний день тижня (тиждень із понеділка)", () => {
    // 2026-09-01 — вівторок, отже одна порожня клітинка попереду.
    expect(leadingBlanks({ year: 2026, month: 9 })).toBe(1);
    // 2027-02-01 — понеділок: зсуву немає.
    expect(leadingBlanks({ year: 2027, month: 2 })).toBe(0);
    // 2026-11-01 — неділя: шість порожніх клітинок.
    expect(leadingBlanks({ year: 2026, month: 11 })).toBe(6);
  });
});

describe("closureOnDate", () => {
  it("знаходить закриття на межах діапазону й між ними", () => {
    expect(closureOnDate([WINTER], "2026-12-28")?.name).toBe("Winter break");
    expect(closureOnDate([WINTER], "2027-01-08")?.name).toBe("Winter break");
    expect(closureOnDate([WINTER], "2027-01-01")?.name).toBe("Winter break");
  });

  it("сусідні дні не закриті", () => {
    expect(closureOnDate([WINTER], "2026-12-27")).toBeNull();
    expect(closureOnDate([WINTER], "2027-01-09")).toBeNull();
  });
});

describe("monthLabel", () => {
  it("називає місяць мовою інтерфейсу", () => {
    expect(monthLabel({ year: 2026, month: 9 }, "uk-UA")).toContain("2026");
    expect(monthLabel({ year: 2026, month: 9 }, "en-GB")).toBe("September 2026");
  });
});
