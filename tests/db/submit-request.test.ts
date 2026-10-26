/**
 * Атомарність заявки — рішення ADR 0001.
 *
 * `public.submit_leave_request` створює заявку й усі її записи в одній транзакції.
 * Якщо котрийсь запис перетинається з наявним, не лишається ЖОДНОГО рядка —
 * ні в `leave_requests`, ні в `leave_records` (AC-LEAVE-16).
 *
 * Тест падає, якщо вставки винести з функції в окремі запити застосунку.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";

/** Виклик функції від імені працівника, як це робить серверна дія через supabase.rpc. */
function submit(
  employee: string,
  records: { position: string; date: string; from: string; to: string }[],
  leaveType = "sick",
) {
  const payload = records.map((r) => ({
    position_id: leave.positions[r.position],
    on_date: r.date,
    starts_at: r.from,
    ends_at: r.to,
  }));
  return leave.asUser<{ submit_leave_request: string }>(
    leave.users[employee],
    "select public.submit_leave_request($1, null, null, $2::jsonb)",
    [leaveType, JSON.stringify(payload)],
  );
}

async function counts() {
  const [row] = await leave.asService<{ requests: string; records: string }>(
    `select (select count(*) from public.leave_requests)::text as requests,
            (select count(*) from public.leave_records)::text as records`,
  );
  return { requests: Number(row.requests), records: Number(row.records) };
}

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.leave_requests");
});

describe("submit_leave_request", () => {
  it("AC-LEAVE-05: дві дати однієї заявки створюють два записи", async () => {
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", date: MONDAY, from: "08:30", to: "15:30" },
      { position: "teacher1@example.test:main", date: TUESDAY, from: "08:30", to: "15:30" },
    ]);

    expect(await counts()).toEqual({ requests: 1, records: 2 });
  });

  it("AC-LEAVE-02: дві посади на одну дату створюють два записи в одній заявці", async () => {
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", date: MONDAY, from: "08:30", to: "15:30" },
      { position: "teacher1@example.test:additional", date: MONDAY, from: "15:45", to: "17:00" },
    ]);

    const [row] = await leave.asService<{ count: string }>(
      `select count(distinct request_id)::text as count from public.leave_records`,
    );
    expect(await counts()).toEqual({ requests: 1, records: 2 });
    expect(Number(row.count)).toBe(1);
  });

  it("AC-LEAVE-16: перетин на другій даті не лишає жодного запису заявки", async () => {
    // Наявний запис на вівторок — його створила попередня заявка.
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", date: TUESDAY, from: "09:00", to: "11:00" },
    ]);
    const before = await counts();

    // Нова заявка: понеділок вільний, вівторок перетинається. Має впасти вся.
    await expect(
      submit("teacher1@example.test", [
        { position: "teacher1@example.test:main", date: MONDAY, from: "08:30", to: "15:30" },
        { position: "teacher1@example.test:main", date: TUESDAY, from: "10:00", to: "12:00" },
      ]),
    ).rejects.toThrow(/You already have a request for this time/);

    // Ключова перевірка: запису на понеділок теж немає.
    expect(await counts()).toEqual(before);
  });

  it("AC-LEAVE-13: текст перетину — дослівно з вимоги PM", async () => {
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", date: MONDAY, from: "09:00", to: "11:00" },
    ]);

    await expect(
      submit("teacher1@example.test", [
        { position: "teacher1@example.test:main", date: MONDAY, from: "10:00", to: "12:00" },
      ]),
    ).rejects.toThrow("You already have a request for this time: 2026-11-02 09:00–11:00");
  });

  it("дотик межами перетином не вважається", async () => {
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", date: MONDAY, from: "09:00", to: "11:00" },
    ]);

    // 11:00–12:00 починається рівно там, де попередній закінчився.
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", date: MONDAY, from: "11:00", to: "12:00" },
    ]);

    expect((await counts()).records).toBe(2);
  });

  it("скасований запис нової заявки не блокує", async () => {
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", date: MONDAY, from: "09:00", to: "11:00" },
    ]);
    await leave.asService("update public.leave_records set status = 'cancelled'");

    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", date: MONDAY, from: "09:00", to: "11:00" },
    ]);

    expect((await counts()).records).toBe(2);
  });

  it("AC-LEAVE-12: Family celebration без ступеня спорідненості база не приймає", async () => {
    // Обмеження leave_requests_relationship_check — друга лінія після buildRecords.
    await expect(
      submit(
        "teacher1@example.test",
        [{ position: "teacher1@example.test:main", date: MONDAY, from: "08:30", to: "15:30" }],
        "family_celebration",
      ),
    ).rejects.toThrow();

    expect(await counts()).toEqual({ requests: 0, records: 0 });
  });

  it("працівник не може створити запис для чужої посади", async () => {
    await expect(
      leave.asUser(
        leave.users["teacher1@example.test"],
        "select public.submit_leave_request('sick', null, null, $1::jsonb)",
        [
          JSON.stringify([
            {
              position_id: leave.positions["teacher2@example.test:main"],
              on_date: MONDAY,
              starts_at: "08:30",
              ends_at: "15:30",
            },
          ]),
        ],
      ),
    ).rejects.toThrow();

    expect(await counts()).toEqual({ requests: 0, records: 0 });
  });
});
