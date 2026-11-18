/**
 * Шкільний календар: межі навчального року, порядок закриттів і їхній підпис.
 *
 * Числа й тексти — з requirements/04-school-calendar.md (знімок 2026-11-18).
 * Задача 3 зрізу: openspec/changes/impl-school-calendar/tasks.md.
 */

import { describe, expect, it } from "vitest";

import {
  closureDatesLabel,
  closuresOfSchoolYear,
  noClosuresMessage,
  parseSchoolYear,
  schoolYearLabel,
  schoolYearRange,
  type ClosureRow,
} from "@/lib/leave/calendar";

function closure(
  id: string,
  name: string,
  startsOn: string,
  endsOn: string,
  closesAt: string | null = null,
): ClosureRow {
  return { id, name, starts_on: startsOn, ends_on: endsOn, closes_at: closesAt };
}

/** «Winter break» 2026-12-28 – 2027-01-08 з AC-CAL-01 — усередині року 2026–2027. */
const winterBreak = closure("1", "Winter break", "2026-12-28", "2027-01-08");
/** Скорочений день «Teachers' meeting» 2026-11-20 з 12:00 (AC-CAL-04). */
const teachersMeeting = closure("2", "Teachers' meeting", "2026-11-20", "2026-11-20", "12:00:00");

describe("межі навчального року", () => {
  it("AC-CAL-15: рік 2026–2027 — це 1 вересня 2026 по 31 серпня 2027", () => {
    expect(schoolYearRange(2026)).toEqual({ from: "2026-09-01", to: "2027-08-31" });
    expect(schoolYearLabel(2026)).toBe("2026–2027");
  });

  it("AC-CAL-15: порожній рік має дослівний текст PM", () => {
    expect(noClosuresMessage(2026)).toBe("No closed days in school year 2026–2027");
    expect(closuresOfSchoolYear([], 2026)).toEqual([]);
  });
});

describe("закриття навчального року", () => {
  it("AC-CAL-02: закриття року показуються в порядку дат", () => {
    // На вхід — у зворотному порядку, щоб перевірялося саме сортування.
    const shown = closuresOfSchoolYear([winterBreak, teachersMeeting], 2026);

    expect(shown.map((c) => c.name)).toEqual(["Teachers' meeting", "Winter break"]);
  });

  it("AC-CAL-02: закриття сусіднього року в перелік не потрапляє", () => {
    const nextYear = closure("3", "Autumn break", "2027-10-26", "2027-10-30");

    expect(closuresOfSchoolYear([winterBreak, nextYear], 2026).map((c) => c.name)).toEqual([
      "Winter break",
    ]);
    expect(closuresOfSchoolYear([winterBreak, nextYear], 2027).map((c) => c.name)).toEqual([
      "Autumn break",
    ]);
  });

  it("AC-CAL-02: закриття через межу 31 серпня видно в обох роках", () => {
    // Припущення PM: whole-day closure that crosses 31 August is shown in both
    // school years. Межа тут — саме 31 серпня, тож беремо діапазон навколо неї.
    const acrossBorder = closure("4", "Summer works", "2027-08-24", "2027-09-04");

    expect(closuresOfSchoolYear([acrossBorder], 2026).map((c) => c.name)).toEqual([
      "Summer works",
    ]);
    expect(closuresOfSchoolYear([acrossBorder], 2027).map((c) => c.name)).toEqual([
      "Summer works",
    ]);
  });

  it("AC-CAL-02: закриття рівно на межах року входить у рік", () => {
    // 1 вересня і 31 серпня — обидва дні належать рокові, тож закриття на
    // будь-який із них має бути видно. Легко зіпсувати строгою нерівністю.
    expect(closuresOfSchoolYear([closure("5", "First day", "2026-09-01", "2026-09-01")], 2026))
      .toHaveLength(1);
    expect(closuresOfSchoolYear([closure("6", "Last day", "2027-08-31", "2027-08-31")], 2026))
      .toHaveLength(1);
    expect(closuresOfSchoolYear([closure("7", "Day before", "2026-08-31", "2026-08-31")], 2026))
      .toHaveLength(0);
  });
});

describe("підпис закриття", () => {
  it("AC-CAL-01: закриття на кілька днів показує обидві дати", () => {
    expect(closureDatesLabel(winterBreak, "з")).toBe("2026-12-28 – 2027-01-08");
  });

  it("AC-CAL-01: закриття на один день показує одну дату", () => {
    expect(closureDatesLabel(closure("8", "Staff day", "2027-01-12", "2027-01-12"), "з")).toBe(
      "2027-01-12",
    );
  });

  it("AC-CAL-04: скорочений день показує дату й час", () => {
    // Час пишемо без секунд: база віддає `12:00:00`, людині потрібно «12:00».
    expect(closureDatesLabel(teachersMeeting, "з")).toBe("2026-11-20, з 12:00");
  });
});

describe("рік із адреси", () => {
  it("AC-CAL-02: без параметра показуємо поточний рік", () => {
    expect(parseSchoolYear(undefined, 2026)).toBe(2026);
  });

  it("AC-CAL-02: рік із адреси беремо як є", () => {
    expect(parseSchoolYear("2027", 2026)).toBe(2027);
  });

  it("AC-CAL-02: сміття в адресі не ламає сторінку", () => {
    // Number("") дає 0, Number("abc") — NaN: обидва показали б не той рік.
    for (const junk of ["", "abc", "2026.5", "-1", "999999", "1999", "2101"]) {
      expect(parseSchoolYear(junk, 2026)).toBe(2026);
    }
  });

  it("AC-CAL-02: межі діапазону років включні", () => {
    expect(parseSchoolYear("2000", 2026)).toBe(2000);
    expect(parseSchoolYear("2100", 2026)).toBe(2100);
  });
});
