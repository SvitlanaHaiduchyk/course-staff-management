/**
 * Погодження з поділом на оплачувану й неоплачувану частини — на рівні бази.
 *
 * Частку дня й залишок рахує сама функція: назовні лишається тільки вибір
 * «з поділом чи ні». Колонкового `grant update` на `days_on_type` і
 * `days_unpaid` ні в кого немає — саме тому числа неможливо підставити.
 *
 * Дані лише синтетичні: supabase/demo-users.json і supabase/demo-positions.json.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

/**
 * Вівторок: у teacher1 основна посада з перервою (08:30–12:00 і 12:30–15:30,
 * разом 390 хв), у teacher2 — суцільні 08:30–15:30 (420 хв).
 */
const TUESDAY = "2026-11-03";
/** Понеділок: основна 420 хв + додаткова 75 хв = 495 хв. */
const MONDAY = "2026-11-02";
const YEAR = 2026;

/** Записує вже використані дні, не проходячи через погодження. */
async function seedUsed(employee: string, position: string, type: string, days: number) {
  const whole = Math.floor(days);
  const rest = Math.round((days - whole) * 100) / 100;
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type) values ($1, $2) returning id`,
    [leave.users[employee], type],
  );
  for (let i = 0; i < whole; i += 1) {
    await leave.asService(
      `insert into public.leave_records
         (request_id, position_id, on_date, starts_at, ends_at, status, days_on_type, days_unpaid)
       values ($1, $2, $3, '08:30', '15:30', 'approved', 1.00, 0.00)`,
      [req.id, leave.positions[position], `2026-09-${String(i + 1).padStart(2, "0")}`],
    );
  }
  if (rest > 0) {
    await leave.asService(
      `insert into public.leave_records
         (request_id, position_id, on_date, starts_at, ends_at, status, days_on_type, days_unpaid)
       values ($1, $2, '2026-09-30', '08:30', '12:00', 'approved', $3, 0.00)`,
      [req.id, leave.positions[position], rest.toFixed(2)],
    );
  }
}

/** Запис на розгляді, який вирішуватимемо. */
async function pendingRecord(input: {
  employee: string;
  position: string;
  date: string;
  type?: string;
  from?: string;
  to?: string;
}) {
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type) values ($1, $2) returning id`,
    [leave.users[input.employee], input.type ?? "personal"],
  );
  const [rec] = await leave.asService<{ id: string }>(
    `insert into public.leave_records (request_id, position_id, on_date, starts_at, ends_at)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      req.id,
      leave.positions[input.position],
      input.date,
      input.from ?? "08:30",
      input.to ?? "15:30",
    ],
  );
  return rec.id;
}

function decide(actor: string, recordId: string, decision: string, withSplit = false) {
  return leave.asUser(
    leave.users[actor],
    "select public.decide_leave_record($1, $2, null, $3)",
    [recordId, decision, withSplit],
  );
}

async function daysOf(recordId: string) {
  const [row] = await leave.asService<{ on_type: string | null; unpaid: string | null }>(
    "select days_on_type::text as on_type, days_unpaid::text as unpaid from public.leave_records where id = $1",
    [recordId],
  );
  return row;
}

async function usedOf(employee: string, type: string) {
  const rows = await leave.asUser<{ leave_type: string; used: string }>(
    leave.users[employee],
    "select leave_type, used::text from public.employee_balance($1, $2::smallint)",
    [leave.users[employee], YEAR],
  );
  return rows.find((r) => r.leave_type === type)?.used;
}

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.leave_requests");
  await leave.asService("delete from public.leave_carryover");
});

describe("списання в межах залишку", () => {
  it("AC-BALANCE-02: цілий день єдиної посади списує 1.00", async () => {
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
      type: "sick",
    });

    await decide("manager1@example.test", id, "approved");

    expect(await daysOf(id)).toEqual({ on_type: "1.00", unpaid: "0.00" });
    expect(await usedOf("teacher1@example.test", "sick")).toBe("1.00");
  });

  it("AC-BALANCE-03: 2 год 30 хв із 7 год списують 0.36", async () => {
    // Саме teacher2: у teacher1 вівторок із перервою 12:00–12:30, тобто
    // 390 робочих хвилин, а AC говорить про суцільні 7 годин.
    const id = await pendingRecord({
      employee: "teacher2@example.test",
      position: "teacher2@example.test:main",
      date: TUESDAY,
      type: "sick",
      from: "09:00",
      to: "11:30",
    });

    await decide("manager1@example.test", id, "approved");

    expect((await daysOf(id)).on_type).toBe("0.36");
  });

  it("AC-BALANCE-15: запис через перерву рахує лише робочі хвилини", async () => {
    // У teacher1 вівторок має перерву 12:00–12:30. Запис 11:00–13:00 триває
    // дві години «по годиннику», але робочих хвилин у ньому 60 + 30 = 90
    // із 390, тобто 0.23 дня. Різниця часу дала б 120/390 = 0.31.
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
      type: "sick",
      from: "11:00",
      to: "13:00",
    });

    await decide("manager1@example.test", id, "approved");

    expect((await daysOf(id)).on_type).toBe("0.23");
  });

  it("AC-BALANCE-05: цілий день посади з перервою — це все одно 1.00", async () => {
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
      type: "sick",
    });

    await decide("manager1@example.test", id, "approved");

    expect((await daysOf(id)).on_type).toBe("1.00");
  });

  it("AC-BALANCE-06: цілий день лише додаткової посади списує 0.15", async () => {
    // У понеділок у працівника 495 робочих хвилин; додаткова дає 75 із них.
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:additional",
      date: MONDAY,
      from: "15:45",
      to: "17:00",
    });

    await decide("manager2@example.test", id, "approved");

    expect((await daysOf(id)).on_type).toBe("0.15");
  });

  it("AC-BALANCE-07: відхилений запис балансу не чіпає", async () => {
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
    });

    await decide("manager1@example.test", id, "rejected");

    expect(await daysOf(id)).toEqual({ on_type: null, unpaid: null });
    expect(await usedOf("teacher1@example.test", "personal")).toBe("0.00");
  });

  it("AC-BALANCE-04: повернений на доопрацювання запис балансу не чіпає", async () => {
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: "2026-11-04",
    });

    await leave.asUser(
      leave.users["manager1@example.test"],
      "select public.decide_leave_record($1, 'returned', 'Enter hours instead of a whole day', false)",
      [id],
    );

    expect(await daysOf(id)).toEqual({ on_type: null, unpaid: null });
    expect(await usedOf("teacher1@example.test", "personal")).toBe("0.00");
  });
});

describe("погодження понад залишок", () => {
  /** Доводить «Personal leave» до залишку рівно 0.50 і повертає запис на цілий день. */
  async function overBalanceSetup() {
    await seedUsed("teacher1@example.test", "teacher1@example.test:main", "personal", 17.5);
    return pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
      type: "personal",
    });
  }

  it("AC-BALANCE-16: без поділу запис не погоджується", async () => {
    const id = await overBalanceSetup();

    await expect(decide("manager1@example.test", id, "approved")).rejects.toThrow(
      "The Personal leave balance is 0.50 day: approve with the suggested split or reject",
    );

    expect(await daysOf(id)).toEqual({ on_type: null, unpaid: null });
    const [row] = await leave.asService<{ status: string }>(
      "select status from public.leave_records where id = $1",
      [id],
    );
    expect(row.status).toBe("awaiting");
  });

  it("AC-BALANCE-10: з поділом — 0.50 Personal leave + 0.50 Unpaid leave", async () => {
    const id = await overBalanceSetup();

    await decide("manager1@example.test", id, "approved", true);

    expect(await daysOf(id)).toEqual({ on_type: "0.50", unpaid: "0.50" });
    expect(await usedOf("teacher1@example.test", "personal")).toBe("18.00");
    expect(await usedOf("teacher1@example.test", "unpaid")).toBe("0.50");
  });

  it("AC-BALANCE-19: за нульового залишку весь день іде в Unpaid leave", async () => {
    await seedUsed("teacher1@example.test", "teacher1@example.test:main", "personal", 18);
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
      type: "personal",
    });

    await decide("manager1@example.test", id, "approved", true);

    expect(await daysOf(id)).toEqual({ on_type: "0.00", unpaid: "1.00" });
    expect(await usedOf("teacher1@example.test", "unpaid")).toBe("1.00");
    // AC-BALANCE-18: запис лишається одним і зберігає свій тип.
    const [row] = await leave.asService<{ leave_type: string; count: string }>(
      `select req.leave_type, count(*)::text as count
         from public.leave_records as rec
         join public.leave_requests as req on req.id = rec.request_id
        where rec.id = $1
        group by req.leave_type`,
      [id],
    );
    expect(row.leave_type).toBe("personal");
    expect(row.count).toBe("1");
  });

  it("AC-BALANCE-14: залишок береться на момент рішення, а не подання", async () => {
    // Залишок 1.50 і два цілі дні на розгляді. Після погодження першого
    // другий уже перевищує залишок і без поділу не проходить.
    await seedUsed("teacher1@example.test", "teacher1@example.test:main", "personal", 16.5);
    const first = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
      type: "personal",
    });
    const second = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: "2026-11-04",
      type: "personal",
    });

    await decide("manager1@example.test", first, "approved");

    await expect(decide("manager1@example.test", second, "approved")).rejects.toThrow(
      "The Personal leave balance is 0.50 day: approve with the suggested split or reject",
    );
  });

  it("типи без ліміту поділу не потребують", async () => {
    // «Unpaid leave» і «Family celebration» лише рахуються (припущення PM).
    await seedUsed("teacher1@example.test", "teacher1@example.test:main", "unpaid", 30);
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
      type: "unpaid",
    });

    await decide("manager1@example.test", id, "approved");

    expect((await daysOf(id)).on_type).toBe("1.00");
    expect(await usedOf("teacher1@example.test", "unpaid")).toBe("31.00");
  });
});

describe("числа підставити не можна", () => {
  it("колонок частки дня в застосунку не змінити", async () => {
    const id = await pendingRecord({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: TUESDAY,
    });
    await decide("manager1@example.test", id, "approved");

    // Жодного колонкового grant update на days_on_type і days_unpaid немає.
    for (const actor of ["manager1@example.test", "teacher1@example.test", "admin@example.test"]) {
      await expect(
        leave.asUser(
          leave.users[actor],
          "update public.leave_records set days_on_type = 0.00 where id = $1",
          [id],
        ),
      ).rejects.toThrow("permission denied for table leave_records");
    }

    expect((await daysOf(id)).on_type).toBe("1.00");
  });
});
