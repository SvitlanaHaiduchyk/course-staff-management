/**
 * Зріз school-calendar на рівні бази: хто може закрити день, які тексти дає
 * public.add_school_closure і що бачить календар.
 *
 * Числа, дати й тексти — з requirements/04-school-calendar.md (знімок 2026-11-18).
 * Дані лише синтетичні: supabase/demo-users.json і supabase/demo-positions.json.
 *
 * Кожен відмовний тест має падати, якщо прибрати відповідну перевірку у
 * функції або політику school_closures_insert_admin.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

/** Понеділок 2026-12-28 — початок «Winter break» з AC-CAL-01. */
const BREAK_FROM = "2026-12-28";
const BREAK_TO = "2027-01-08";
/** Вівторок 2026-12-29 — усередині «Winter break» (AC-CAL-07). */
const TUESDAY_IN_BREAK = "2026-12-29";
/** П'ятниця 2026-11-20 — скорочений день «Teachers' meeting» (AC-CAL-04). */
const FRIDAY = "2026-11-20";

function addClosure(
  actor: string,
  name: string,
  startsOn: string,
  endsOn: string,
  closesAt: string | null = null,
) {
  return leave.asUser(
    leave.users[actor],
    "select public.add_school_closure($1, $2, $3, $4) as id",
    [name, startsOn, endsOn, closesAt],
  );
}

/** Запис відпустки від імені service_role — готуємо стан, не перевіряємо його. */
async function seedRecord(
  employee: string,
  positionKey: string,
  onDate: string,
  startsAt = "08:30",
  endsAt = "15:30",
  status = "awaiting",
) {
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type) values ($1, 'sick') returning id`,
    [leave.users[employee]],
  );
  await leave.asService(
    `insert into public.leave_records (request_id, position_id, on_date, starts_at, ends_at, status)
     values ($1, $2, $3, $4, $5, $6)`,
    [req.id, leave.positions[positionKey], onDate, startsAt, endsAt, status],
  );
}

async function closureNames() {
  const rows = await leave.asService<{ name: string }>(
    "select name from public.school_closures order by starts_on",
  );
  return rows.map((r) => r.name);
}

// 60 секунд, як в інших тестах бази: у повному прогоні сім файлів піднімають
// по своїй PGlite паралельно, і типових 10 секунд на старт не вистачає.
beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.school_closures");
  await leave.asService("delete from public.leave_requests");
});

describe("додавання закриття", () => {
  it("AC-CAL-01: адміністратор додає закриття на цілі дні", async () => {
    await addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO);

    // Дати форматує сама база: драйвер віддав би `date` як JS Date, а той
    // надрукувався б у локальній зоні — тест залежав би від зони машини.
    const [row] = await leave.asService<{
      name: string;
      starts_on: string;
      ends_on: string;
      closes_at: string | null;
    }>(`select name,
               to_char(starts_on, 'YYYY-MM-DD') as starts_on,
               to_char(ends_on, 'YYYY-MM-DD') as ends_on,
               closes_at
        from public.school_closures`);

    expect(row.name).toBe("Winter break");
    expect(row.starts_on).toBe("2026-12-28");
    expect(row.ends_on).toBe("2027-01-08");
    expect(row.closes_at).toBeNull();
  });

  it("AC-CAL-02: календар бачить кожен авторизований, не лише адміністратор", async () => {
    await addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO);

    const seen = await leave.asUser<{ name: string }>(
      leave.users["teacher1@example.test"],
      "select name from public.school_closures",
    );

    expect(seen.map((r) => r.name)).toEqual(["Winter break"]);
  });

  it("AC-CAL-14: неавторизований не бачить жодної назви чи дати", async () => {
    await addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO);

    // anon не має grant на таблицю взагалі — не порожній список, а відмова.
    await expect(leave.asAnon("select name from public.school_closures")).rejects.toThrow(
      "permission denied for table school_closures",
    );
  });
});

describe("змінювати календар може лише адміністратор", () => {
  it("AC-CAL-12: працівник не додасть закриття", async () => {
    await expect(
      addClosure("teacher1@example.test", "Winter break", BREAK_FROM, BREAK_TO),
    ).rejects.toThrow("violates row-level security policy");

    expect(await closureNames()).toEqual([]);
  });

  it("AC-CAL-13: менеджер не закриє день повз сторінки порталу", async () => {
    await expect(
      addClosure("manager1@example.test", "Staff day", "2026-11-27", "2026-11-27"),
    ).rejects.toThrow("violates row-level security policy");

    expect(await closureNames()).toEqual([]);
  });

  it("AC-CAL-13: менеджер не прибере чуже закриття прямим delete", async () => {
    await addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO);

    await leave.asUser(
      leave.users["manager1@example.test"],
      "delete from public.school_closures",
    );

    expect(await closureNames()).toEqual(["Winter break"]);
  });
});

describe("перевірки перед збереженням", () => {
  it("AC-CAL-18: закриття без назви не зберігається", async () => {
    await expect(
      addClosure("admin@example.test", "   ", "2027-01-20", "2027-01-20"),
    ).rejects.toThrow("Enter a name for the closure");

    expect(await closureNames()).toEqual([]);
  });

  it("AC-CAL-19: назва зі 101 символу не зберігається", async () => {
    await expect(
      addClosure("admin@example.test", "x".repeat(101), "2027-01-20", "2027-01-20"),
    ).rejects.toThrow("The name can be at most 100 characters");

    expect(await closureNames()).toEqual([]);
  });

  it("AC-CAL-19: межа — рівно 100 символів зберігається", async () => {
    // Межа з AC: 101 відмовляє, отже 100 має пройти. Інакше ми б мовчки
    // звузили правило PM на один символ.
    await addClosure("admin@example.test", "x".repeat(100), "2027-01-20", "2027-01-20");

    expect(await closureNames()).toHaveLength(1);
  });

  it("AC-CAL-10: дата кінця раніша за дату початку", async () => {
    await expect(
      addClosure("admin@example.test", "Winter break", "2027-01-08", "2026-12-28"),
    ).rejects.toThrow("The end date cannot be earlier than the start date");

    expect(await closureNames()).toEqual([]);
  });

  it("AC-CAL-11: дата вже закрита іншим закриттям", async () => {
    await addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO);

    await expect(
      addClosure("admin@example.test", "Staff day", "2026-12-30", "2026-12-30"),
    ).rejects.toThrow("2026-12-30 is already closed: Winter break");

    expect(await closureNames()).toEqual(["Winter break"]);
  });

  it("AC-CAL-17: перетин із кількома закриттями називає кожне", async () => {
    await addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO);
    await addClosure("admin@example.test", "Staff day", "2027-01-12", "2027-01-12");

    await expect(
      addClosure("admin@example.test", "Extra break", "2027-01-05", "2027-01-15"),
    ).rejects.toThrow(
      "2027-01-05 is already closed: Winter break, 2027-01-12 is already closed: Staff day",
    );

    expect(await closureNames()).toEqual(["Winter break", "Staff day"]);
  });
});

describe("дні з записами відпустки", () => {
  it("AC-CAL-07: погоджений запис не дає закрити день", async () => {
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", TUESDAY_IN_BREAK,
      "08:30", "15:30", "approved");

    await expect(
      addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO),
    ).rejects.toThrow(
      "These days have leave records and cannot be closed: 2026-12-29 teacher1@example.test",
    );

    expect(await closureNames()).toEqual([]);
  });

  it("AC-CAL-08: відхилений запис закрити день не заважає", async () => {
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", TUESDAY_IN_BREAK,
      "08:30", "15:30", "rejected");

    await addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO);

    expect(await closureNames()).toEqual(["Winter break"]);
  });

  it("AC-CAL-20: запис, що кінчається до часу закриття, скороченому дню не заважає", async () => {
    // Той самий запис із AC-CAL-20: 08:30–11:00 проти закриття з 12:00.
    // Саме тому AC-CAL-07 і AC-CAL-20 не суперечать одне одному.
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", FRIDAY,
      "08:30", "11:00", "approved");

    await addClosure("admin@example.test", "Teachers' meeting", FRIDAY, FRIDAY, "12:00");

    expect(await closureNames()).toEqual(["Teachers' meeting"]);
  });

  it("AC-CAL-07: запис із хвилинами після часу закриття скорочений день блокує", async () => {
    // Дзеркало попереднього тесту: та сама дата, той самий час закриття, але
    // запис триває по 15:30 — отже має заблокувати.
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", FRIDAY,
      "08:30", "15:30", "approved");

    await expect(
      addClosure("admin@example.test", "Teachers' meeting", FRIDAY, FRIDAY, "12:00"),
    ).rejects.toThrow("These days have leave records and cannot be closed");

    expect(await closureNames()).toEqual([]);
  });
});

describe("прибирання закриття", () => {
  it("AC-CAL-09: адміністратор прибирає закриття", async () => {
    await addClosure("admin@example.test", "Winter break", BREAK_FROM, BREAK_TO);

    await leave.asUser(leave.users["admin@example.test"], "delete from public.school_closures");

    expect(await closureNames()).toEqual([]);
  });
});
