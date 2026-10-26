/**
 * Що працівник може зробити з власним записом до рішення: години, скасування,
 * повторне подання — на рівні бази.
 *
 * Відмови тут тримає політика `leave_records_update_own_pending` і колонкові
 * `grant`, а не код сторінки: прибери їх — і ці тести впадуть. Мутаційну
 * таблицю наведено в описі PR.
 *
 * Дані лише синтетичні: supabase/demo-users.json і supabase/demo-positions.json.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

const MONDAY = "2026-11-02";

async function seedRecord(
  employee: string,
  positionKey: string,
  hours: [string, string] = ["08:30", "15:30"],
  status = "awaiting",
) {
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type) values ($1, 'sick') returning id`,
    [leave.users[employee]],
  );
  const [rec] = await leave.asService<{ id: string }>(
    `insert into public.leave_records (request_id, position_id, on_date, starts_at, ends_at, status)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [req.id, leave.positions[positionKey], MONDAY, hours[0], hours[1], status],
  );
  return rec.id;
}

function changeHours(
  actor: string,
  recordId: string,
  startsAt: string,
  endsAt: string,
  resubmit = false,
) {
  return leave.asUser(
    leave.users[actor],
    "select public.update_record_hours($1, $2::time, $3::time, $4)",
    [recordId, startsAt, endsAt, resubmit],
  );
}

async function recordRow(recordId: string) {
  const [row] = await leave.asService<{ starts_at: string; ends_at: string; status: string }>(
    "select starts_at, ends_at, status from public.leave_records where id = $1",
    [recordId],
  );
  return row;
}

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.leave_requests");
});

describe("зміна годин", () => {
  it("AC-DECIDE-16: години запису на розгляді змінюються, статус лишається", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await changeHours("teacher1@example.test", id, "09:00", "12:00");

    expect(await recordRow(id)).toEqual({
      starts_at: "09:00:00",
      ends_at: "12:00:00",
      status: "awaiting",
    });
  });

  it("AC-DECIDE-06: повернутий запис виправляють і подають знову", async () => {
    const id = await seedRecord(
      "teacher1@example.test",
      "teacher1@example.test:main",
      ["08:30", "15:30"],
      "returned",
    );

    await changeHours("teacher1@example.test", id, "09:00", "12:00", true);

    expect(await recordRow(id)).toEqual({
      starts_at: "09:00:00",
      ends_at: "12:00:00",
      status: "awaiting",
    });
  });

  it("AC-DECIDE-12: години погодженого запису не змінити", async () => {
    const id = await seedRecord(
      "teacher1@example.test",
      "teacher1@example.test:main",
      ["08:30", "15:30"],
      "approved",
    );

    await expect(changeHours("teacher1@example.test", id, "09:00", "12:00")).rejects.toThrow(
      "This record is already approved and cannot be changed",
    );

    expect((await recordRow(id)).starts_at).toBe("08:30:00");
  });

  it("AC-DECIDE-22: нові години не можуть перетнути інший запис тієї самої посади", async () => {
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", ["08:30", "10:00"]);
    const second = await seedRecord(
      "teacher1@example.test",
      "teacher1@example.test:main",
      ["13:00", "15:30"],
    );

    await expect(changeHours("teacher1@example.test", second, "09:00", "15:30")).rejects.toThrow(
      "You already have a request for this time: 2026-11-02 08:30–10:00",
    );

    expect((await recordRow(second)).starts_at).toBe("13:00:00");
  });

  it("сам із собою запис не перетинається", async () => {
    // Припущення PM: «not checked for overlap against itself». Без цього
    // звузити власні години було б неможливо.
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await changeHours("teacher1@example.test", id, "09:00", "15:00");

    expect((await recordRow(id)).starts_at).toBe("09:00:00");
  });

  it("чужий запис працівник не змінить", async () => {
    const id = await seedRecord("teacher2@example.test", "teacher2@example.test:main");

    await expect(changeHours("teacher1@example.test", id, "09:00", "12:00")).rejects.toThrow(
      "Record not found",
    );

    expect((await recordRow(id)).starts_at).toBe("08:30:00");
  });
});

describe("скасування й повторне подання", () => {
  const cancel = (actor: string, recordId: string) =>
    leave.asUser(
      leave.users[actor],
      "update public.leave_records set status = 'cancelled' where id = $1",
      [recordId],
    );

  it("AC-DECIDE-13: запис на розгляді працівник скасовує", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await cancel("teacher1@example.test", id);

    expect((await recordRow(id)).status).toBe("cancelled");
  });

  it("AC-DECIDE-17: скасований запис повторно не подати", async () => {
    const id = await seedRecord(
      "teacher1@example.test",
      "teacher1@example.test:main",
      ["08:30", "15:30"],
      "returned",
    );
    await cancel("teacher1@example.test", id);

    // using політики лишає тільки 'awaiting' і 'returned' — рядок не зачепить.
    await leave.asUser(
      leave.users["teacher1@example.test"],
      "update public.leave_records set status = 'awaiting' where id = $1",
      [id],
    );
    await expect(changeHours("teacher1@example.test", id, "09:00", "12:00", true)).rejects.toThrow();

    expect((await recordRow(id)).status).toBe("cancelled");
  });

  it("погоджений запис працівник не скасує", async () => {
    // Скасування погодженого — зріз WS11 (Out of scope вимоги).
    const id = await seedRecord(
      "teacher1@example.test",
      "teacher1@example.test:main",
      ["08:30", "15:30"],
      "approved",
    );

    await cancel("teacher1@example.test", id);

    expect((await recordRow(id)).status).toBe("approved");
  });

  it("чужий запис працівник не скасує", async () => {
    const id = await seedRecord("teacher2@example.test", "teacher2@example.test:main");

    await cancel("teacher1@example.test", id);

    expect((await recordRow(id)).status).toBe("awaiting");
  });
});

describe("чого змінити не можна взагалі", () => {
  it("AC-DECIDE-21: тип відпустки працівник не змінить", async () => {
    // В authenticated немає жодного grant update на leave_requests —
    // запит падає на правах, не на політиці.
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await expect(
      leave.asUser(
        leave.users["teacher1@example.test"],
        `update public.leave_requests set leave_type = 'personal'
          where id = (select request_id from public.leave_records where id = $1)`,
        [id],
      ),
    ).rejects.toThrow();

    const [row] = await leave.asService<{ leave_type: string }>(
      `select leave_type from public.leave_requests
        where id = (select request_id from public.leave_records where id = $1)`,
      [id],
    );
    expect(row.leave_type).toBe("sick");
  });

  it("дату й посаду запису не змінити: колонкових grant немає", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    for (const sql of [
      "update public.leave_records set on_date = '2026-11-03' where id = $1",
      "update public.leave_records set position_id = position_id where id = $1",
    ]) {
      await expect(leave.asUser(leave.users["teacher1@example.test"], sql, [id])).rejects.toThrow();
    }

    const [row] = await leave.asService<{ on_date: string }>(
      "select on_date::text from public.leave_records where id = $1",
      [id],
    );
    expect(row.on_date).toBe(MONDAY);
  });
});
