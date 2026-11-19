/**
 * Знаменник частки дня проти шкільного календаря — на рівні бази.
 *
 * Вимоги: `requirements/04-school-calendar.md` (знімок 2026-11-18), `AC-CAL-06`
 * і `AC-CAL-20`; план: `openspec/changes/impl-school-calendar/tasks.md`, задача 6.
 *
 * Найтонше місце зрізу: міняється функція, від якої залежать уже прийняті
 * `AC-BALANCE-02`, `-03`, `-05`, `-06`. Тому тут не лише нова поведінка, а й
 * регресія — дні **без** закриття мають дати ті самі числа, що й раніше.
 *
 * Дані лише синтетичні: `supabase/demo-users.json`, `supabase/demo-positions.json`.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

/** Вівторок: у teacher2 суцільні 08:30–15:30 — 420 робочих хвилин. */
const TUESDAY = "2026-11-03";
/** Понеділок: у teacher1 основна 420 хв + додаткова 75 хв = 495 хв. */
const MONDAY = "2026-11-02";
const YEAR = 2026;

async function addClosure(input: { name: string; date: string; closesAt: string | null }) {
  await leave.asService(
    `insert into public.school_closures (name, starts_on, ends_on, closes_at, created_by)
     values ($1, $2, $2, $3, $4)`,
    [input.name, input.date, input.closesAt, leave.users["admin@example.test"]],
  );
}

async function workingMinutes(employee: string, date: string) {
  const [row] = await leave.asUser<{ minutes: number }>(
    leave.users[employee],
    "select public.working_minutes_on($1, $2::date) as minutes",
    [leave.users[employee], date],
  );
  return Number(row.minutes);
}

async function pendingRecord(input: {
  employee: string;
  position: string;
  date: string;
  from?: string;
  to?: string;
}) {
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type) values ($1, 'sick') returning id`,
    [leave.users[input.employee]],
  );
  const [rec] = await leave.asService<{ id: string }>(
    `insert into public.leave_records (request_id, position_id, on_date, starts_at, ends_at)
     values ($1, $2, $3, $4, $5) returning id`,
    [req.id, leave.positions[input.position], input.date, input.from ?? "08:30", input.to ?? "15:30"],
  );
  return rec.id;
}

async function daysOf(recordId: string) {
  const [row] = await leave.asService<{ on_type: string | null }>(
    "select days_on_type::text as on_type from public.leave_records where id = $1",
    [recordId],
  );
  return row.on_type;
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
  await leave.asService("delete from public.school_closures");
});

describe("робочі хвилини дати проти шкільного календаря", () => {
  it("AC-CAL-06: скорочений день лишає лише хвилини до часу закриття", async () => {
    // teacher2: 08:30–15:30 = 420 хв; закриття з 12:00 лишає 08:30–12:00 = 210.
    expect(await workingMinutes("teacher2@example.test", TUESDAY)).toBe(420);

    await addClosure({ name: "Teachers' meeting", date: TUESDAY, closesAt: "12:00" });

    expect(await workingMinutes("teacher2@example.test", TUESDAY)).toBe(210);
  });

  it("AC-CAL-06: закриття на цілий день не лишає жодної робочої хвилини", async () => {
    await addClosure({ name: "Winter break", date: TUESDAY, closesAt: null });

    expect(await workingMinutes("teacher2@example.test", TUESDAY)).toBe(0);
  });

  it("AC-CAL-06: блок, що закінчується рівно в час закриття, лишається цілим", async () => {
    // Межа з AC-CAL-04 дослівно: 08:30–15:30 при закритті з 15:30 — це всі 420
    // хвилин, бо кінець блоку в нього не входить.
    await addClosure({ name: "Late closure", date: TUESDAY, closesAt: "15:30" });

    expect(await workingMinutes("teacher2@example.test", TUESDAY)).toBe(420);
  });

  it("AC-CAL-06: блок, що починається після закриття, не дає від'ємних хвилин", async () => {
    // У teacher1 понеділок має додаткову посаду 15:45–17:00 — вона вся після 12:00.
    await addClosure({ name: "Teachers' meeting", date: MONDAY, closesAt: "12:00" });

    // Лишається тільки основна посада, обрізана до 08:30–12:00.
    expect(await workingMinutes("teacher1@example.test", MONDAY)).toBe(210);
  });

  it("AC-CAL-06: «цілий день» скороченого дня списує 1.00, а не частку повного дня", async () => {
    await addClosure({ name: "Teachers' meeting", date: TUESDAY, closesAt: "12:00" });

    // Запис на обрізаний розклад: 08:30–12:00 — це 210 хв із 210 робочих.
    const id = await pendingRecord({
      employee: "teacher2@example.test",
      position: "teacher2@example.test:main",
      date: TUESDAY,
      to: "12:00",
    });

    await leave.asUser(
      leave.users["manager1@example.test"],
      "select public.decide_leave_record($1, 'approved', null, false)",
      [id],
    );

    expect(await daysOf(id)).toBe("1.00");
    expect(await usedOf("teacher2@example.test", "sick")).toBe("1.00");
  });
});

describe("регресія: дні без закриття рахуються як раніше", () => {
  it("AC-BALANCE-02: цілий день єдиної посади і далі списує 1.00", async () => {
    const id = await pendingRecord({
      employee: "teacher2@example.test",
      position: "teacher2@example.test:main",
      date: TUESDAY,
    });

    await leave.asUser(
      leave.users["manager1@example.test"],
      "select public.decide_leave_record($1, 'approved', null, false)",
      [id],
    );

    expect(await daysOf(id)).toBe("1.00");
  });

  it("AC-BALANCE-03: 2 год 30 хв із 7 год і далі дають 0.36", async () => {
    const id = await pendingRecord({
      employee: "teacher2@example.test",
      position: "teacher2@example.test:main",
      date: TUESDAY,
      from: "09:00",
      to: "11:30",
    });

    await leave.asUser(
      leave.users["manager1@example.test"],
      "select public.decide_leave_record($1, 'approved', null, false)",
      [id],
    );

    expect(await daysOf(id)).toBe("0.36");
  });

  it("AC-BALANCE-06: знаменник і далі бере ВСІ посади працівника", async () => {
    // Понеділок teacher1: 420 + 75 = 495 хвилин, і це без календаря не змінилося.
    expect(await workingMinutes("teacher1@example.test", MONDAY)).toBe(495);
  });
});

describe("AC-CAL-20: пізніше закриття не змінює вже погодженого запису", () => {
  it("AC-CAL-20: частка лишається тією, що була в момент погодження", async () => {
    // 2 год 30 хв із 420 = 0.36 — погоджуємо ДО будь-якого закриття.
    const id = await pendingRecord({
      employee: "teacher2@example.test",
      position: "teacher2@example.test:main",
      date: TUESDAY,
      from: "08:30",
      to: "11:00",
    });

    await leave.asUser(
      leave.users["manager1@example.test"],
      "select public.decide_leave_record($1, 'approved', null, false)",
      [id],
    );
    expect(await daysOf(id)).toBe("0.36");

    // Тепер адміністратор закриває цей день з 12:00. Знаменник на майбутнє
    // змінився (210 хвилин), але вже погоджений запис не перераховується.
    await addClosure({ name: "Teachers' meeting", date: TUESDAY, closesAt: "12:00" });

    expect(await workingMinutes("teacher2@example.test", TUESDAY)).toBe(210);
    expect(await daysOf(id)).toBe("0.36");
    expect(await usedOf("teacher2@example.test", "sick")).toBe("0.36");
  });
});
