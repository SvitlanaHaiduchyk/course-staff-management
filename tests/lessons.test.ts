// Заняття посади (уроки, наради) — шар показу поверх робочих годин.
// Назви тестів без AC ID: вимог PM на заняття немає, жодного AC цей шар не
// покриває (ADR 0004, docs/spec-reading.md 2026-11-27), і `ac:coverage` ці
// тести покриттям не рахує. Дані лише синтетичні.

import { describe, expect, it } from "vitest";

import {
  lessonLabel,
  lessonsOn,
  parseLessonInput,
  positionLabel,
  positionLabels,
  type LessonFields,
  type LessonRow,
} from "../src/lib/leave/lessons";

function lesson(partial: Partial<LessonRow> & { id: string; weekday: number }): LessonRow {
  return {
    position_id: "p-main",
    starts_at: "08:30:00",
    ends_at: "09:15:00",
    subject: "Maths",
    form: "4-A",
    ...partial,
  };
}

const FIELDS: LessonFields = {
  positionId: "p-main",
  weekday: "2",
  startsAt: "08:30",
  endsAt: "09:15",
  subject: "Maths",
  form: "4-A",
};

// 2026-11-23 — понеділок, 2026-11-24 — вівторок.
describe("lessonsOn", () => {
  const week = [
    lesson({ id: "b", weekday: 1, starts_at: "10:00:00", ends_at: "10:45:00" }),
    lesson({ id: "a", weekday: 1 }),
    lesson({ id: "c", weekday: 2 }),
  ];

  it("бере заняття того дня тижня, у який потрапляє дата", () => {
    expect(lessonsOn(week, "2026-11-23").map((l) => l.id)).toEqual(["a", "b"]);
    expect(lessonsOn(week, "2026-11-24").map((l) => l.id)).toEqual(["c"]);
  });

  it("день без занять дає порожній список", () => {
    expect(lessonsOn(week, "2026-11-25")).toEqual([]);
    expect(lessonsOn([], "2026-11-23")).toEqual([]);
  });
});

describe("lessonLabel", () => {
  it("предмет і клас разом", () => {
    expect(lessonLabel({ subject: "Algebra", form: "8A" })).toBe("Algebra, 8A");
  });

  it("заняття без класу — лише назва", () => {
    expect(lessonLabel({ subject: "Нарада кафедри", form: null })).toBe("Нарада кафедри");
    expect(lessonLabel({ subject: "Нарада кафедри", form: "  " })).toBe("Нарада кафедри");
  });
});

describe("positionLabel", () => {
  it("підрозділ перший, посада друга", () => {
    expect(
      positionLabel({ id: "p", job_title: "Teacher", divisions: { name: "Elementary school" } }),
    ).toBe("Elementary school / Teacher");
  });

  it("без підрозділу лишається сама посада, а не «— · Teacher»", () => {
    expect(positionLabel({ id: "p", job_title: "Teacher", divisions: null })).toBe("Teacher");
    expect(positionLabel({ id: "p", job_title: "Teacher" })).toBe("Teacher");
    expect(positionLabel({ id: "p", job_title: "Teacher", divisions: { name: " " } })).toBe(
      "Teacher",
    );
  });

  it("мапа підписів — за id посади, бо заняття знає лише position_id", () => {
    const labels = positionLabels([
      { id: "p-main", job_title: "Teacher", divisions: { name: "Elementary school" } },
      { id: "p-extra", job_title: "Math teacher", divisions: { name: "High school" } },
    ]);

    expect(labels.get("p-extra")).toBe("High school / Math teacher");
    expect(labels.get("p-none")).toBeUndefined();
  });
});

describe("parseLessonInput", () => {
  it("повні поля дають рядок для бази", () => {
    const parsed = parseLessonInput(FIELDS);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.input).toEqual({
      position_id: "p-main",
      weekday: 2,
      starts_at: "08:30",
      ends_at: "09:15",
      subject: "Maths",
      form: "4-A",
    });
  });

  it("порожній клас стає null, а не порожнім рядком", () => {
    const parsed = parseLessonInput({ ...FIELDS, form: "   " });

    expect(parsed.ok && parsed.input.form).toBeNull();
  });

  it("без предмета заняття не зберігається", () => {
    expect(parseLessonInput({ ...FIELDS, subject: "  " })).toEqual({
      ok: false,
      messageKey: "lessons.errSubject",
    });
    expect(parseLessonInput({ ...FIELDS, subject: "x".repeat(101) })).toEqual({
      ok: false,
      messageKey: "lessons.errSubject",
    });
  });

  it("день тижня поза 1…7 не приймаємо", () => {
    expect(parseLessonInput({ ...FIELDS, weekday: "0" })).toEqual({
      ok: false,
      messageKey: "lessons.errWeekday",
    });
    expect(parseLessonInput({ ...FIELDS, weekday: "8" })).toEqual({
      ok: false,
      messageKey: "lessons.errWeekday",
    });
    expect(parseLessonInput({ ...FIELDS, weekday: "" })).toEqual({
      ok: false,
      messageKey: "lessons.errWeekday",
    });
  });

  it("кінець рівно на початку — не заняття (межа строга, як lessons_order_check)", () => {
    expect(parseLessonInput({ ...FIELDS, endsAt: "08:30" })).toEqual({
      ok: false,
      messageKey: "lessons.errOrder",
    });
    expect(parseLessonInput({ ...FIELDS, endsAt: "08:29" })).toEqual({
      ok: false,
      messageKey: "lessons.errOrder",
    });
    expect(parseLessonInput({ ...FIELDS, endsAt: "08:31" }).ok).toBe(true);
  });

  it("порожній час і порожня посада мають власні повідомлення", () => {
    expect(parseLessonInput({ ...FIELDS, startsAt: "" })).toEqual({
      ok: false,
      messageKey: "lessons.errTime",
    });
    expect(parseLessonInput({ ...FIELDS, positionId: " " })).toEqual({
      ok: false,
      messageKey: "lessons.errPosition",
    });
  });

  it("задовгий клас не приймаємо", () => {
    expect(parseLessonInput({ ...FIELDS, form: "x".repeat(21) })).toEqual({
      ok: false,
      messageKey: "lessons.errForm",
    });
  });
});
