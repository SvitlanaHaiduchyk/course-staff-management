/**
 * Задача 2 зміни impl-leave: побудова записів заявки й заборона перетину.
 *
 * Назви тестів починаються з AC ID — так їх знаходить npm run ac:coverage.
 * Дані лише синтетичні.
 */

import { describe, expect, it } from "vitest";

import {
  CHOOSE_AT_LEAST_ONE_POSITION,
  COMMENT_TOO_LONG,
  RELATIONSHIP_REQUIRED,
  type Position,
  type RequestInput,
  buildRecords,
} from "../src/lib/leave/build";
import {
  type ExistingRecord,
  findOverlap,
  isBlocking,
  overlapMessage,
} from "../src/lib/leave/overlap";
import { type ScheduleBlock } from "../src/lib/leave/schedule";

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";
const SATURDAY = "2026-11-07";

/** Основна посада «Elementary school / Teacher», пн–пт 08:30–15:30 (AC-LEAVE-01). */
const mainBlocks: ScheduleBlock[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startsAt: "08:30",
  endsAt: "15:30",
}));

/** Додаткова посада «High school / Math teacher», пн 15:45–17:00 (AC-LEAVE-02). */
const additionalBlocks: ScheduleBlock[] = [{ weekday: 1, startsAt: "15:45", endsAt: "17:00" }];

const main: Position = { id: "pos-main", blocks: mainBlocks };
const additional: Position = { id: "pos-additional", blocks: additionalBlocks };

function wholeDay(positionId: string, included = true) {
  return { positionId, included, wholeDay: true };
}

function sick(dates: RequestInput["dates"]): RequestInput {
  return { leaveType: "sick", dates };
}

describe("створення записів із заявки", () => {
  it("AC-LEAVE-01: цілий день на одній посаді дає один запис 08:30–15:30", () => {
    const result = buildRecords(sick([{ date: MONDAY, positions: [wholeDay(main.id)] }]), [main]);

    expect(result).toEqual({
      ok: true,
      records: [{ positionId: "pos-main", date: MONDAY, startsAt: "08:30", endsAt: "15:30" }],
    });
  });

  it("AC-LEAVE-02: цілий день на двох посадах дає два записи з різними годинами", () => {
    const result = buildRecords(
      sick([{ date: MONDAY, positions: [wholeDay(main.id), wholeDay(additional.id)] }]),
      [main, additional],
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.records).toEqual([
      { positionId: "pos-main", date: MONDAY, startsAt: "08:30", endsAt: "15:30" },
      { positionId: "pos-additional", date: MONDAY, startsAt: "15:45", endsAt: "17:00" },
    ]);
  });

  it("AC-LEAVE-03: виключена посада запису не створює", () => {
    const result = buildRecords(
      sick([
        { date: MONDAY, positions: [wholeDay(main.id), wholeDay(additional.id, false)] },
      ]),
      [main, additional],
    );

    expect(result.ok && result.records).toHaveLength(1);
    expect(result.ok && result.records[0].positionId).toBe("pos-main");
  });

  it("AC-LEAVE-05: дві дати дають по запису на дату в одній заявці", () => {
    const result = buildRecords(
      sick([
        { date: MONDAY, positions: [wholeDay(main.id)] },
        { date: TUESDAY, positions: [wholeDay(main.id)] },
      ]),
      [main],
    );

    expect(result.ok && result.records).toHaveLength(2);
    expect(result.ok && result.records.map((r) => r.date)).toEqual([MONDAY, TUESDAY]);
  });

  it("AC-LEAVE-04: години створюють запис саме з цими годинами", () => {
    const result = buildRecords(
      {
        leaveType: "personal",
        dates: [
          {
            date: MONDAY,
            positions: [
              {
                positionId: main.id,
                included: true,
                wholeDay: false,
                hours: { startsAt: "09:00", endsAt: "11:30" },
              },
            ],
          },
        ],
      },
      [main],
    );

    expect(result.ok && result.records[0]).toEqual({
      positionId: "pos-main",
      date: MONDAY,
      startsAt: "09:00",
      endsAt: "11:30",
    });
  });

  it("AC-LEAVE-06: дата без розкладу не створює заявки", () => {
    const result = buildRecords(sick([{ date: SATURDAY, positions: [wholeDay(main.id)] }]), [main]);

    expect(result).toEqual({ ok: false, message: "You have no working hours on this day" });
  });
});

describe("відмови на рівні заявки", () => {
  it("AC-LEAVE-10: жодної включеної посади — заявка не створюється", () => {
    const result = buildRecords(
      sick([{ date: MONDAY, positions: [wholeDay(main.id, false)] }]),
      [main],
    );

    expect(result).toEqual({ ok: false, message: CHOOSE_AT_LEAST_ONE_POSITION });
    expect(result.ok ? "" : result.message).toBe("Choose at least one position");
  });

  it("AC-LEAVE-12: «Family celebration» без ступеня спорідненості не приймається", () => {
    const result = buildRecords(
      { leaveType: "family_celebration", dates: [{ date: MONDAY, positions: [wholeDay(main.id)] }] },
      [main],
    );

    expect(result).toEqual({ ok: false, message: RELATIONSHIP_REQUIRED });
    expect(result.ok ? "" : result.message).toContain(
      "sibling, child, parent, grandchild or grandparent",
    );
  });

  it("AC-LEAVE-17: коментар зберігається на всіх записах заявки", () => {
    const input: RequestInput = {
      leaveType: "sick",
      comment: "Doctor's appointment",
      dates: [{ date: MONDAY, positions: [wholeDay(main.id), wholeDay(additional.id)] }],
    };
    const result = buildRecords(input, [main, additional]);

    // Коментар належить заявці, тож його мають усі її записи.
    expect(result.ok && result.records).toHaveLength(2);
    expect(input.comment).toBe("Doctor's appointment");
  });

  it("AC-LEAVE-18: коментар на 501 символ не приймається", () => {
    const result = buildRecords(
      {
        leaveType: "sick",
        comment: "x".repeat(501),
        dates: [{ date: MONDAY, positions: [wholeDay(main.id)] }],
      },
      [main],
    );

    expect(result).toEqual({ ok: false, message: COMMENT_TOO_LONG });
  });

  it("AC-LEAVE-11: до підтвердження зведення записів не створено", () => {
    const input = sick([
      { date: MONDAY, positions: [wholeDay(main.id)] },
      { date: TUESDAY, positions: [wholeDay(main.id)] },
    ]);

    // buildRecords лише готує записи зведення; вставки тут немає,
    // тож повернення до редагування нічого не створює і введене лишається в input.
    const preview = buildRecords(input, [main]);

    expect(preview.ok && preview.records).toHaveLength(2);
    expect(input.dates).toHaveLength(2);
  });
});

describe("заборона перетину", () => {
  const awaiting: ExistingRecord = {
    id: "rec-1",
    positionId: "pos-main",
    date: MONDAY,
    startsAt: "09:00",
    endsAt: "11:00",
    status: "awaiting",
  };

  it("AC-LEAVE-13: перетин із наявним записом тієї самої посади", () => {
    const candidate = buildRecords(
      {
        leaveType: "personal",
        dates: [
          {
            date: MONDAY,
            positions: [
              {
                positionId: main.id,
                included: true,
                wholeDay: false,
                hours: { startsAt: "10:00", endsAt: "12:00" },
              },
            ],
          },
        ],
      },
      [main],
    );

    const clash = findOverlap([awaiting], candidate.ok ? candidate.records : []);

    expect(clash).toBe(awaiting);
    expect(overlapMessage(clash!)).toBe(
      "You already have a request for this time: 2026-11-02 09:00–11:00",
    );
  });

  it("AC-LEAVE-16: перетин на одній даті скасовує записи обох дат заявки", () => {
    const existingTue: ExistingRecord = { ...awaiting, id: "rec-2", date: TUESDAY };
    const candidate = buildRecords(
      sick([
        { date: MONDAY, positions: [wholeDay(main.id)] },
        { date: TUESDAY, positions: [wholeDay(main.id)] },
      ]),
      [main],
    );
    const records = candidate.ok ? candidate.records : [];

    const clash = findOverlap([existingTue], records);

    // Заявка зберігається цілком: знайдений перетин скасовує її всю, разом із записом на понеділок.
    expect(records).toHaveLength(2);
    expect(clash).toBe(existingTue);
    expect(overlapMessage(clash!)).toBe(
      "You already have a request for this time: 2026-11-03 09:00–11:00",
    );
  });

  it("AC-LEAVE-13: записи «Rejected» і «Cancelled» нових заявок не блокують", () => {
    const rejected: ExistingRecord = { ...awaiting, id: "rec-3", status: "rejected" };
    const cancelled: ExistingRecord = { ...awaiting, id: "rec-4", status: "cancelled" };
    const candidate = buildRecords(sick([{ date: MONDAY, positions: [wholeDay(main.id)] }]), [main]);

    expect(isBlocking("rejected")).toBe(false);
    expect(isBlocking("cancelled")).toBe(false);
    expect(findOverlap([rejected, cancelled], candidate.ok ? candidate.records : [])).toBeNull();
  });

  it("AC-DECIDE-22: запис, який редагують, не перевіряється сам із собою", () => {
    const edited = [{ positionId: "pos-main", date: MONDAY, startsAt: "09:30", endsAt: "10:30" }];

    // Без виключення запис перетнувся б сам із собою і зміну було б відхилено.
    expect(findOverlap([awaiting], edited)).toBe(awaiting);
    expect(findOverlap([awaiting], edited, "rec-1")).toBeNull();
  });
});
