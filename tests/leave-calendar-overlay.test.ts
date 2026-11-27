// Особистий шар шкільного календаря: години розкладу дня та власні відпустки.
// Дані лише синтетичні.

import { describe, expect, it } from "vitest";

import { blocksOn, leavesByDate, openBlocks, type LeaveMark } from "../src/lib/leave/calendar-overlay";

const MAIN = {
  id: "p-main",
  job_title: "Math teacher",
  schedule_blocks: [
    { weekday: 1, starts_at: "08:30:00", ends_at: "12:00:00" },
    { weekday: 1, starts_at: "12:30:00", ends_at: "15:30:00" },
    { weekday: 3, starts_at: "09:00:00", ends_at: "13:00:00" },
  ],
};
const EXTRA = {
  id: "p-extra",
  job_title: "Librarian",
  schedule_blocks: [{ weekday: 1, starts_at: "16:00:00", ends_at: "18:00:00" }],
};

function leave(on_date: string, status = "approved"): LeaveMark {
  return { on_date, status, starts_at: "08:30:00", ends_at: "15:30:00", leave_type: "sick" };
}

// 2026-11-23 — понеділок, 2026-11-25 — середа, 2026-11-26 — четвер,
// 2026-11-28 — субота.
describe("blocksOn", () => {
  it("збирає блоки всіх посад дня в порядку часу", () => {
    const blocks = blocksOn([MAIN, EXTRA], "2026-11-23");

    expect(blocks.map((b) => b.starts_at)).toEqual(["08:30:00", "12:30:00", "16:00:00"]);
    expect(blocks.map((b) => b.jobTitle)).toEqual(["Math teacher", "Math teacher", "Librarian"]);
  });

  it("бере лише той день тижня, про який питають", () => {
    expect(blocksOn([MAIN, EXTRA], "2026-11-25").map((b) => b.ends_at)).toEqual(["13:00:00"]);
  });

  it("день без блоків і посада без розкладу дають порожній список", () => {
    expect(blocksOn([MAIN, EXTRA], "2026-11-26")).toEqual([]);
    expect(blocksOn([MAIN, EXTRA], "2026-11-28")).toEqual([]);
    expect(blocksOn([{ id: "p", job_title: "Cleaner", schedule_blocks: null }], "2026-11-23")).toEqual([]);
    expect(blocksOn([{ id: "p", job_title: "Cleaner" }], "2026-11-23")).toEqual([]);
  });
});

describe("openBlocks", () => {
  const monday = blocksOn([MAIN, EXTRA], "2026-11-23");

  it("без закриття розклад лишається цілим", () => {
    expect(openBlocks(monday, null)).toHaveLength(3);
  });

  it("закриття на цілий день не лишає жодного блоку", () => {
    expect(openBlocks(monday, { closes_at: null })).toEqual([]);
  });

  // Саме правило обрізання (AC-CAL-04) перевіряє tests/leave-closure.test.ts —
  // тут лише те, що календар кличе його, а не рахує по-своєму.
  it("скорочений день обрізає блок часом закриття", () => {
    const open = openBlocks(monday, { closes_at: "13:00:00" });

    // 08:30–12:00 лишився цілим, 12:30–15:30 закінчується о 13:00,
    // 16:00–18:00 починається після закриття — його немає.
    expect(open.map((b) => `${b.starts_at}–${b.ends_at}`)).toEqual(["08:30–12:00", "12:30–13:00"]);
    expect(open.map((b) => b.jobTitle)).toEqual(["Math teacher", "Math teacher"]);
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
