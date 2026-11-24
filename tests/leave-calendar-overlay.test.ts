// Особистий шар шкільного календаря: робочі дні людини та її відпустки.
// Дані лише синтетичні.

import { describe, expect, it } from "vitest";

import {
  leavesByDate,
  workingWeekdays,
  worksOn,
  type LeaveMark,
} from "../src/lib/leave/calendar-overlay";

const MAIN = { schedule_blocks: [{ weekday: 1 }, { weekday: 3 }, { weekday: 5 }] };
const EXTRA = { schedule_blocks: [{ weekday: 2 }] };

function leave(on_date: string, status = "approved"): LeaveMark {
  return { on_date, status, starts_at: "08:30:00", ends_at: "15:30:00", leave_type: "sick" };
}

describe("workingWeekdays", () => {
  it("рахує дні всіх посад разом", () => {
    expect([...workingWeekdays([MAIN, EXTRA])].sort()).toEqual([1, 2, 3, 5]);
  });

  it("посада без розкладу не додає днів", () => {
    expect(workingWeekdays([{ schedule_blocks: [] }, { schedule_blocks: null }]).size).toBe(0);
    expect(workingWeekdays([{}]).size).toBe(0);
  });
});

describe("worksOn", () => {
  const days = workingWeekdays([MAIN, EXTRA]);

  it("робочий день за розкладом — робочий", () => {
    // 2026-11-23 — понеділок, 2026-11-24 — вівторок.
    expect(worksOn(days, "2026-11-23")).toBe(true);
    expect(worksOn(days, "2026-11-24")).toBe(true);
  });

  it("день без блоків розкладу й вихідні — не робочі", () => {
    // 2026-11-26 — четвер (у розкладі його немає), 2026-11-28 — субота.
    expect(worksOn(days, "2026-11-26")).toBe(false);
    expect(worksOn(days, "2026-11-28")).toBe(false);
    expect(worksOn(days, "2026-11-29")).toBe(false);
  });
});

describe("leavesByDate", () => {
  it("групує записи за датою", () => {
    const map = leavesByDate([leave("2026-11-23"), leave("2026-11-25")]);

    expect(map.get("2026-11-23")).toHaveLength(1);
    expect(map.get("2026-11-25")).toHaveLength(1);
    expect(map.get("2026-11-24")).toBeUndefined();
  });

  it("два записи на одну дату (дві посади) лишаються обидва", () => {
    // AC-LEAVE-02: заявка на дві посади дає два записи на ту саму дату.
    const map = leavesByDate([leave("2026-11-23"), leave("2026-11-23", "awaiting")]);

    expect(map.get("2026-11-23")).toHaveLength(2);
    expect(map.get("2026-11-23")?.map((r) => r.status)).toEqual(["approved", "awaiting"]);
  });

  it("порожній список дає порожню мапу", () => {
    expect(leavesByDate([]).size).toBe(0);
  });
});
