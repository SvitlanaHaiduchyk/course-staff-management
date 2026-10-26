/**
 * Відмовні AC, які захищає база: RLS-політики й колонкові GRANT із
 * supabase/migrations/20261020203434_leave_schema.sql.
 *
 * Кожен тест має падати, якщо прибрати політику або грант, — у цьому й сенс:
 * він перевіряє не код застосунку, а те, що база сама по собі не віддає зайвого
 * і не дає змінити того, чого не можна. Мутаційну перевірку описано в PR.
 *
 * Дані лише синтетичні: усі з supabase/demo-users.json і supabase/demo-positions.json.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";

/** Створює заявку з одним записом від імені service_role (готуємо стан, не перевіряємо його). */
async function seedRecord(
  employee: string,
  positionKey: string,
  date: string,
  status = "awaiting",
) {
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type) values ($1, 'sick') returning id`,
    [leave.users[employee]],
  );
  const [rec] = await leave.asService<{ id: string }>(
    `insert into public.leave_records (request_id, position_id, on_date, starts_at, ends_at, status)
     values ($1, $2, $3, '08:30', '15:30', $4) returning id`,
    [req.id, leave.positions[positionKey], date, status],
  );
  return rec.id;
}

async function statusOf(recordId: string) {
  const [row] = await leave.asService<{ status: string }>(
    "select status from public.leave_records where id = $1",
    [recordId],
  );
  return row.status;
}

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.leave_requests");
});

describe("хто які записи бачить", () => {
  it("AC-LEAVE-14: працівник бачить рівно свої записи й жодного чужого", async () => {
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", MONDAY);
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", TUESDAY);
    await seedRecord("teacher2@example.test", "teacher2@example.test:main", MONDAY);
    await seedRecord("teacher2@example.test", "teacher2@example.test:main", TUESDAY);
    await seedRecord("teacher2@example.test", "teacher2@example.test:main", "2026-11-04");

    // Запиту без фільтра за працівником: відсікати має політика, а не умова в SQL.
    const seen = await leave.asUser<{ id: string }>(
      leave.users["teacher1@example.test"],
      "select id from public.leave_records",
    );
    const all = await leave.asService<{ id: string }>("select id from public.leave_records");

    expect(all).toHaveLength(5);
    expect(seen).toHaveLength(2);
  });

  // Половина AC-DECIDE-01: політика віддає менеджеру лише записи його посад.
  // Сам список «Awaiting decision» — зріз leave-decision, тож AC лишається відкладеним.
  it("менеджер бачить записи лише тих посад, за які відповідає", async () => {
    // Основну посаду teacher1 веде manager1, додаткову — manager2.
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", MONDAY);
    await seedRecord("teacher1@example.test", "teacher1@example.test:additional", MONDAY);

    const seenByManager2 = await leave.asUser<{ position_id: string }>(
      leave.users["manager2@example.test"],
      "select position_id from public.leave_records",
    );

    expect(seenByManager2).toHaveLength(1);
    expect(seenByManager2[0].position_id).toBe(leave.positions["teacher1@example.test:additional"]);
  });

  it("анонімний відвідувач не бачить жодного запису", async () => {
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", MONDAY);

    // anon не має навіть GRANT SELECT — запит має впасти, а не повернути порожнє.
    await expect(leave.asAnon("select id from public.leave_records")).rejects.toThrow();
  });
});

describe("хто може змінити статус запису", () => {
  it("AC-DECIDE-09: працівник без ролі менеджера не може погодити власний запис", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main", MONDAY);

    await expect(
      leave.asUser(
        leave.users["teacher1@example.test"],
        "update public.leave_records set status = 'approved' where id = $1",
        [id],
      ),
    ).rejects.toThrow();

    expect(await statusOf(id)).toBe("awaiting");
  });

  it("AC-DECIDE-08: менеджер чужої посади не може погодити запис", async () => {
    // manager2 веде лише додаткову посаду teacher1; це запис основної.
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main", MONDAY);

    // Відколи зріз рішень дав authenticated колонковий grant update (status),
    // запит уже не падає на правах: політика просто не віддає цей рядок, і
    // update не зачіпає жодного. AC вимагає саме «the status does not change».
    await leave.asUser(
      leave.users["manager2@example.test"],
      "update public.leave_records set status = 'approved' where id = $1",
      [id],
    );

    expect(await statusOf(id)).toBe("awaiting");
  });

  it("статус не змінити повз історію рішень, навіть адміністратору", async () => {
    // Зріз leave-decision дозволив адміністратору вирішувати (AC-DECIDE-10), але
    // лише через public.decide_leave_record: прямий update без рядка історії
    // валить відкладений constraint trigger на commit (AC-DECIDE-15).
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main", MONDAY);

    await expect(
      leave.asUser(
        leave.users["admin@example.test"],
        "update public.leave_records set status = 'rejected' where id = $1",
        [id],
      ),
    ).rejects.toThrow();

    expect(await statusOf(id)).toBe("awaiting");
  });
});

describe("що працівник може змінити у власному записі", () => {
  it("години запису, що чекає рішення, змінити можна", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main", MONDAY);

    await leave.asUser(
      leave.users["teacher1@example.test"],
      "update public.leave_records set starts_at = '09:00' where id = $1",
      [id],
    );

    const [row] = await leave.asService<{ starts_at: string }>(
      "select starts_at from public.leave_records where id = $1",
      [id],
    );
    expect(row.starts_at).toBe("09:00:00");
  });

  // Половина AC-DECIDE-12: база блокує зміну, повідомлення дасть екран рішень.
  it("години погодженого запису база не дає змінити", async () => {
    const id = await seedRecord(
      "teacher1@example.test",
      "teacher1@example.test:main",
      MONDAY,
      "approved",
    );

    // Політика leave_records_update_own_awaiting пускає лише awaiting і returned,
    // тож рядок просто не потрапляє під update: помилки немає, змін теж.
    await leave.asUser(
      leave.users["teacher1@example.test"],
      "update public.leave_records set starts_at = '09:00' where id = $1",
      [id],
    );

    const [row] = await leave.asService<{ starts_at: string }>(
      "select starts_at from public.leave_records where id = $1",
      [id],
    );
    expect(row.starts_at).toBe("08:30:00");
  });

  it("чужий запис працівник змінити не може", async () => {
    const id = await seedRecord("teacher2@example.test", "teacher2@example.test:main", MONDAY);

    await leave.asUser(
      leave.users["teacher1@example.test"],
      "update public.leave_records set starts_at = '09:00' where id = $1",
      [id],
    );

    const [row] = await leave.asService<{ starts_at: string }>(
      "select starts_at from public.leave_records where id = $1",
      [id],
    );
    expect(row.starts_at).toBe("08:30:00");
  });
});

describe("самопідвищення ролі", () => {
  it("працівник не може змінити собі роль у профілі", async () => {
    await expect(
      leave.asUser(
        leave.users["teacher1@example.test"],
        "update public.profiles set role = 'admin' where id = $1",
        [leave.users["teacher1@example.test"]],
      ),
    ).rejects.toThrow();

    const [row] = await leave.asService<{ role: string }>(
      "select role from public.profiles where id = $1",
      [leave.users["teacher1@example.test"]],
    );
    expect(row.role).toBe("employee");
  });

  it("працівник бачить лише власний профіль", async () => {
    const seen = await leave.asUser<{ email: string }>(
      leave.users["teacher1@example.test"],
      "select email from public.profiles",
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].email).toBe("teacher1@example.test");
  });
});
