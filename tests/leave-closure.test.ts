/**
 * Обрізання розкладу закриттями шкільного календаря.
 *
 * Числа — з прикладів PM у requirements/04-school-calendar.md (знімок 2026-11-04).
 * Задача 1 зрізу: openspec/changes/impl-school-calendar/tasks.md.
 */

import { describe, expect, it } from "vitest";

import {
  blocksAfterClosure,
  blocksOnDate,
  closedFrom,
  closureOn,
  isWholeDayClosure,
  type Closure,
} from "@/lib/leave/closure";
import { scheduleFor, totalMinutes, wholeDayRange, type ScheduleBlock } from "@/lib/leave/schedule";
import { schoolClosedMessage, validateClosedDate } from "@/lib/leave/validate";

/** П'ятниця 2026-11-20 — дата скороченого дня «Teachers' meeting» з AC-CAL-04. */
const FRIDAY = "2026-11-20";
/** Вівторок 2026-12-29 — усередині «Winter break» з AC-CAL-01. */
const TUESDAY_IN_BREAK = "2026-12-29";

/** Пн–пт 08:30–15:30 — розклад працівника з AC-CAL-03 і AC-CAL-04. */
const weekdays: ScheduleBlock[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startsAt: "08:30",
  endsAt: "15:30",
}));

/** Пт 13:00–17:00 — працює по обіді; випадок із питання …spec#22. */
const afternoonOnly: ScheduleBlock[] = [{ weekday: 5, startsAt: "13:00", endsAt: "17:00" }];

/** Пт 08:30–12:00 і 12:30–15:30 — розклад із перервою. */
const twoBlocksFri: ScheduleBlock[] = [
  { weekday: 5, startsAt: "08:30", endsAt: "12:00" },
  { weekday: 5, startsAt: "12:30", endsAt: "15:30" },
];

const earlyDismissal: Closure = {
  name: "Teachers' meeting",
  startsOn: FRIDAY,
  endsOn: FRIDAY,
  closesAt: "12:00",
};

const winterBreak: Closure = {
  name: "Winter break",
  startsOn: "2026-12-28",
  endsOn: "2027-01-08",
  closesAt: null,
};

describe("закриття на дату", () => {
  it("AC-CAL-03: дата всередині закриття на цілі дні знаходить це закриття", () => {
    expect(closureOn([winterBreak], TUESDAY_IN_BREAK)).toEqual(winterBreak);
  });

  it("AC-CAL-03: обидві межі закриття включно, сусідні дати — вільні", () => {
    expect(closureOn([winterBreak], "2026-12-28")).toEqual(winterBreak);
    expect(closureOn([winterBreak], "2027-01-08")).toEqual(winterBreak);
    expect(closureOn([winterBreak], "2026-12-27")).toBeNull();
    expect(closureOn([winterBreak], "2027-01-09")).toBeNull();
  });

  it("AC-CAL-04: скорочений день закриває добу з указаного часу, цілий день — з півночі", () => {
    expect(isWholeDayClosure(winterBreak)).toBe(true);
    expect(isWholeDayClosure(earlyDismissal)).toBe(false);
    expect(closedFrom(winterBreak)).toBe("00:00");
    expect(closedFrom(earlyDismissal)).toBe("12:00");
    expect(closedFrom(null)).toBeNull();
  });
});

describe("обрізання блоків", () => {
  it("AC-CAL-04: цілий день при закритті з 12:00 — це 08:30–12:00 і 210 хвилин", () => {
    const blocks = blocksOnDate(scheduleFor(weekdays, FRIDAY), [earlyDismissal], FRIDAY);

    expect(blocks).toEqual([{ weekday: 5, startsAt: "08:30", endsAt: "12:00" }]);
    expect(wholeDayRange(blocks)).toEqual({ startsAt: "08:30", endsAt: "12:00" });
    // Саме це число AC називає знаменником частки дня: 210 з 210.
    expect(totalMinutes(blocks)).toBe(210);
  });

  it("AC-CAL-04: блок, що закінчується рівно в час закриття, лишається цілим", () => {
    const blocks = blocksOnDate(scheduleFor(twoBlocksFri, FRIDAY), [earlyDismissal], FRIDAY);

    // 08:30–12:00 ціле, 12:30–15:30 відпало: воно починається після часу закриття.
    expect(blocks).toEqual([{ weekday: 5, startsAt: "08:30", endsAt: "12:00" }]);
    expect(totalMinutes(blocks)).toBe(210);
  });

  it("AC-CAL-04: закриття на кінці останнього блоку не забирає жодної хвилини", () => {
    const blocks = blocksAfterClosure(scheduleFor(weekdays, FRIDAY), "15:30");

    expect(blocks).toEqual(scheduleFor(weekdays, FRIDAY));
    expect(totalMinutes(blocks)).toBe(420);
  });

  it("AC-CAL-03: закриття на цілий день не лишає жодного блоку", () => {
    const blocks = blocksOnDate(
      scheduleFor(weekdays, TUESDAY_IN_BREAK),
      [winterBreak],
      TUESDAY_IN_BREAK,
    );

    expect(blocks).toEqual([]);
  });

  it("AC-CAL-05: розклад після обіду при закритті з 12:00 не лишає жодного блоку", () => {
    const blocks = blocksOnDate(scheduleFor(afternoonOnly, FRIDAY), [earlyDismissal], FRIDAY);

    // Випадок із питання …spec#22: блоків нуль, тож далі спрацює наявне правило
    // «дата без розкладу», а не назва закриття. Поведінка випливає з двох вимог.
    expect(blocks).toEqual([]);
  });

  it("AC-CAL-04: без закриттів розклад дати лишається недоторканим", () => {
    const blocks = blocksOnDate(scheduleFor(weekdays, FRIDAY), [], FRIDAY);

    expect(blocks).toEqual(scheduleFor(weekdays, FRIDAY));
    expect(totalMinutes(blocks)).toBe(420);
  });
});

describe("закрита дата в заявці", () => {
  it("AC-CAL-03: закритий на цілий день день не приймається з назвою закриття", () => {
    const result = validateClosedDate(winterBreak);

    expect(result).toEqual({
      ok: false,
      message: "The school is closed on this day: Winter break",
    });
    expect(schoolClosedMessage("Winter break")).toBe(
      "The school is closed on this day: Winter break",
    );
  });

  it("AC-CAL-04: дата зі скороченим днем приймається — її розклад лише обрізано", () => {
    expect(validateClosedDate(earlyDismissal)).toEqual({ ok: true });
  });

  it("AC-CAL-03: дата без закриття приймається", () => {
    expect(validateClosedDate(null)).toEqual({ ok: true });
  });
});
