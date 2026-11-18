/**
 * Розбір форми закриття: що саме піде в `public.add_school_closure`.
 *
 * Тут перевіряємо лише те, чого база не побачить: перетворення «скорочений
 * день → одна дата» і два тексти PM про порожні поля. Назву, порядок дат,
 * перетини й блокувальні записи перевіряє база — і для них є свої тести в
 * tests/db/school-calendar.test.ts.
 */

import { describe, expect, it } from "vitest";

import {
  CLOSING_TIME_REQUIRED,
  DATES_REQUIRED,
  parseClosureInput,
  type ClosureFields,
} from "@/lib/leave/closure-input";

function fields(over: Partial<ClosureFields> = {}): ClosureFields {
  return {
    name: "Winter break",
    kind: "whole",
    startsOn: "2026-12-28",
    endsOn: "2027-01-08",
    closesAt: "",
    ...over,
  };
}

describe("закриття на цілі дні", () => {
  it("AC-CAL-01: обидві дати йдуть у базу, часу закриття немає", () => {
    const result = parseClosureInput(fields());

    expect(result).toEqual({
      ok: true,
      input: {
        p_name: "Winter break",
        p_starts_on: "2026-12-28",
        p_ends_on: "2027-01-08",
        p_closes_at: null,
      },
    });
  });

  it("AC-CAL-01: час закриття з форми ігнорується, якщо обрано цілі дні", () => {
    // Поле часу видно завжди (форма має працювати без JavaScript), тож у ньому
    // може лишитися значення від попередньої спроби. Вид закриття головніший.
    const result = parseClosureInput(fields({ closesAt: "12:00" }));

    expect(result.ok && result.input.p_closes_at).toBeNull();
  });

  it("AC-CAL-10: порожня дата кінця зупиняє з текстом PM", () => {
    expect(parseClosureInput(fields({ endsOn: "" }))).toEqual({
      ok: false,
      message: DATES_REQUIRED,
    });
  });
});

describe("скорочений день", () => {
  it("AC-CAL-04: кінцем стає сама дата початку", () => {
    const result = parseClosureInput(
      fields({ kind: "early", startsOn: "2026-11-20", endsOn: "", closesAt: "12:00" }),
    );

    expect(result).toEqual({
      ok: true,
      input: {
        p_name: "Winter break",
        p_starts_on: "2026-11-20",
        p_ends_on: "2026-11-20",
        p_closes_at: "12:00",
      },
    });
  });

  it("AC-CAL-04: чужа дата кінця в полі скороченому дню не заважає", () => {
    // Поле «дата кінця» теж видно завжди; для скороченого дня його не читають.
    const result = parseClosureInput(
      fields({ kind: "early", startsOn: "2026-11-20", endsOn: "2027-01-08", closesAt: "12:00" }),
    );

    expect(result.ok && result.input.p_ends_on).toBe("2026-11-20");
  });

  it("скорочений день без часу закриття зупиняє з текстом PM", () => {
    expect(
      parseClosureInput(fields({ kind: "early", startsOn: "2026-11-20", closesAt: "" })),
    ).toEqual({ ok: false, message: CLOSING_TIME_REQUIRED });
  });

  it("скорочений день без дати зупиняє текстом про дати, а не про час", () => {
    // Порядок перевірок видно саме тут: спершу дати, потім час.
    expect(
      parseClosureInput(fields({ kind: "early", startsOn: "", closesAt: "" })),
    ).toEqual({ ok: false, message: DATES_REQUIRED });
  });
});

describe("назва", () => {
  it("AC-CAL-18: порожня назва не зупиняється тут — її перевіряє база", () => {
    // Навмисно: межі назви задає PM, і вирішувати їх у двох місцях не можна.
    const result = parseClosureInput(fields({ name: "   " }));

    expect(result.ok).toBe(true);
    expect(result.ok && result.input.p_name).toBe("   ");
  });
});
