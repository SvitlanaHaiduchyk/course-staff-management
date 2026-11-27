/**
 * Заміни — чиста логіка `src/lib/leave/substitutes.ts`.
 *
 * Числа й назви посад — із прикладів PM у `requirements/06-substitutes.md`:
 * «Elementary school / Teacher», «Elementary school / Assistant»,
 * «High school / Math teacher», 08:30–12:00 = 210 хвилин.
 */

import { describe, expect, it } from "vitest";

import {
  NO_SUBSTITUTE,
  NO_SUBSTITUTES_YET,
  emptyListHint,
  isAssistantTitle,
  isTeacherTitle,
  minutesBetween,
  substituteLabel,
  upgradeMark,
} from "@/lib/leave/substitutes";

describe("позначка підвищення", () => {
  it("AC-SUBST-08: асистент замість вчителя — позначка з хвилинами", () => {
    expect(
      upgradeMark({
        absentJobTitle: "Teacher",
        substituteJobTitle: "Assistant",
        minutes: minutesBetween("08:30", "12:00"),
      }),
    ).toBe("With upgrade: 210 min");
  });

  it("AC-SUBST-09: вчитель замість вчителя — позначки немає", () => {
    expect(
      upgradeMark({
        absentJobTitle: "Teacher",
        substituteJobTitle: "Math teacher",
        minutes: 210,
      }),
    ).toBeNull();
  });

  it("назва посади з «teacher» усередині лишається вчительською", () => {
    // PM називає цей випадок прямо: «any job title that contains "teacher",
    // for example "Math teacher"». Рівність замість `includes` зробила б
    // AC-SUBST-09 нерозрізненним від AC-SUBST-08.
    expect(isTeacherTitle("Math teacher")).toBe(true);
    expect(isTeacherTitle("TEACHER")).toBe(true);
    expect(isTeacherTitle("Assistant")).toBe(false);
    expect(isAssistantTitle("Teaching assistant")).toBe(true);
  });

  it("підвищення не ставимо, коли відсутній не вчитель", () => {
    expect(
      upgradeMark({ absentJobTitle: "Librarian", substituteJobTitle: "Assistant", minutes: 210 }),
    ).toBeNull();
  });
});

describe("хвилини запису", () => {
  it("AC-SUBST-08: 08:30–12:00 — це 210 хвилин", () => {
    expect(minutesBetween("08:30", "12:00")).toBe(210);
    expect(minutesBetween("08:30:00", "15:30:00")).toBe(420);
  });
});

describe("підпис заміни", () => {
  it("AC-SUBST-03: без заміни на записі — «No substitute»", () => {
    expect(substituteLabel(null)).toBe(NO_SUBSTITUTE);
    expect(substituteLabel("  ")).toBe(NO_SUBSTITUTE);
    expect(substituteLabel("assistant1@example.test")).toBe("assistant1@example.test");
  });
});

describe("порожній список замін", () => {
  it("AC-SUBST-11: замість вибору — рядок PM, і заявку це не зупиняє", () => {
    expect(emptyListHint(0)).toBe(NO_SUBSTITUTES_YET);
    // Є з кого вибирати — підказки немає, показуємо сам вибір.
    expect(emptyListHint(2)).toBeNull();
  });
});
