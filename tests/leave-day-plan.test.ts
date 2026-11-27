// День посади як перелік відрізків: заняття, вільний робочий час і перерви.
// Назви без AC ID: це показ, а не доменне правило — межі робочого часу задають
// schedule_blocks, і їх перевіряють тести заявки. Дані синтетичні.

import { describe, expect, it } from "vitest";

import { daySegments, hoursLabel, spanLabel } from "../src/lib/leave/day-plan";

const span = (starts_at: string, ends_at: string) => ({ starts_at, ends_at });

/** Коротко про відрізок: «08:30–09:15 entry» чи «11:15–13:00 free». */
const shape = (segments: ReturnType<typeof daySegments>) =>
  segments.map((s) => `${spanLabel(s)} ${s.kind}`);

describe("daySegments", () => {
  it("порожній блок — один відрізок вільного часу на всю довжину", () => {
    expect(shape(daySegments([span("08:30", "15:30")], []))).toEqual(["08:30–15:30 free"]);
  });

  it("заняття розбивають блок, вільний час лишається між ними", () => {
    const segments = daySegments(
      [span("08:30", "15:30")],
      [span("08:30", "09:15"), span("09:30", "10:15")],
    );

    expect(shape(segments)).toEqual([
      "08:30–09:15 entry",
      "09:15–09:30 free",
      "09:30–10:15 entry",
      "10:15–15:30 free",
    ]);
  });

  it("проміжок МІЖ блоками — перерва, а не вільний час", () => {
    // Це різні речі: у перерву людина не працює взагалі, тож і відпустку на
    // неї не беруть.
    const segments = daySegments(
      [span("08:30", "12:00"), span("12:30", "15:30")],
      [span("08:30", "09:15")],
    );

    expect(shape(segments)).toEqual([
      "08:30–09:15 entry",
      "09:15–12:00 free",
      "12:00–12:30 break",
      "12:30–15:30 free",
    ]);
  });

  it("заняття впритул до межі блоку не лишає порожнього відрізка", () => {
    const segments = daySegments([span("08:30", "09:15")], [span("08:30", "09:15")]);

    expect(shape(segments)).toEqual(["08:30–09:15 entry"]);
  });

  it("запис, що переходить через перерву, показано один раз", () => {
    // AC-LEAVE-15 дозволяє заявку 11:00–13:00 при блоках 08:30–12:00 і
    // 12:30–15:30. Показати її двічі означало б сказати, що відпусток дві.
    const segments = daySegments(
      [span("08:30", "12:00"), span("12:30", "15:30")],
      [span("11:00", "13:00")],
    );

    expect(shape(segments)).toEqual([
      "08:30–11:00 free",
      "11:00–13:00 entry",
      "12:00–12:30 break",
      "13:00–15:30 free",
    ]);
  });

  it("порядок відрізків — за часом, незалежно від порядку входу", () => {
    const segments = daySegments(
      [span("12:30", "15:30"), span("08:30", "12:00")],
      [span("13:00", "14:00"), span("08:30", "09:15")],
    );

    expect(shape(segments)[0]).toBe("08:30–09:15 entry");
    expect(shape(segments).at(-1)).toBe("14:00–15:30 free");
  });

  it("день без блоків не дає жодного відрізка", () => {
    expect(daySegments([], [span("08:30", "09:15")])).toEqual([]);
  });

  it("сам запис доступний у відрізку, а не лише його межі", () => {
    const lesson = { starts_at: "08:30", ends_at: "09:15", subject: "Maths" };
    const [first] = daySegments([span("08:30", "15:30")], [lesson]);

    expect(first.kind === "entry" && first.entry.subject).toBe("Maths");
  });
});

describe("hoursLabel", () => {
  it("перелічує кожен блок, а не загальний проміжок", () => {
    // «08:30–15:30» на день із перервою сказало б, що людина працює й о 12:15.
    expect(hoursLabel([span("08:30:00", "12:00:00"), span("12:30:00", "15:30:00")])).toBe(
      "08:30–12:00, 12:30–15:30",
    );
  });

  it("порядок блоків не залежить від порядку входу", () => {
    expect(hoursLabel([span("12:30", "15:30"), span("08:30", "12:00")])).toBe(
      "08:30–12:00, 12:30–15:30",
    );
  });

  it("день без блоків дає порожній рядок", () => {
    expect(hoursLabel([])).toBe("");
  });
});

describe("spanLabel", () => {
  it("секунди бази відкидає", () => {
    expect(spanLabel(span("08:30:00", "09:15:00"))).toBe("08:30–09:15");
  });
});
