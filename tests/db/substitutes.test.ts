/**
 * Зріз substitutes на рівні бази: хто веде список замін, що приймається в
 * записі заявки і коли заміна вважається зайнятою.
 *
 * Межі тут тримають політики (`AC-SUBST-12`, `AC-SUBST-13`), функція
 * `private.substitute_busy_at` (`AC-SUBST-05` … `AC-SUBST-07`) і
 * `public.submit_leave_request`. Дані синтетичні: supabase/demo-users.json
 * і supabase/demo-positions.json.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

/** Середа 2026-12-02 — та сама дата, що в AC PM. */
const WEDNESDAY = "2026-12-02";

function addSubstitute(actor: string, employee: string, substitute: string) {
  return leave.asUser(
    leave.users[actor],
    `insert into public.substitutes (employee_id, substitute_id, added_by)
     values ($1, $2, $3)`,
    [leave.users[employee], leave.users[substitute], leave.users[actor]],
  );
}

async function listFor(viewer: string, employee: string) {
  const rows = await leave.asUser<{ email: string }>(
    leave.users[viewer],
    `select p.email
       from public.substitutes as s
       join public.profiles as p on p.id = s.substitute_id
      where s.employee_id = $1
      order by p.email`,
    [leave.users[employee]],
  );
  return rows.map((r) => r.email);
}

/** Подання заявки через ту саму функцію, що й сторінка. */
function submit(
  actor: string,
  records: { position: string; date?: string; from?: string; to?: string; substitute?: string }[],
) {
  const payload = records.map((r) => ({
    position_id: leave.positions[r.position],
    on_date: r.date ?? WEDNESDAY,
    starts_at: r.from ?? "08:30",
    ends_at: r.to ?? "15:30",
    substitute_id: r.substitute ? leave.users[r.substitute] : null,
  }));
  return leave.asUser<{ submit_leave_request: string }>(
    leave.users[actor],
    "select public.submit_leave_request($1, $2, $3, $4::jsonb) as submit_leave_request",
    ["personal", null, null, JSON.stringify(payload)],
  );
}

/** Запис будь-якого статусу — готуємо стан, а не перевіряємо його. */
async function seedRecord(options: {
  employee: string;
  positionKey: string;
  status: string;
  from: string;
  to: string;
  substitute?: string;
}) {
  const [req] = await leave.asService<{ id: string }>(
    "insert into public.leave_requests (employee_id, leave_type) values ($1, 'personal') returning id",
    [leave.users[options.employee]],
  );
  const [rec] = await leave.asService<{ id: string }>(
    `insert into public.leave_records
       (request_id, position_id, on_date, starts_at, ends_at, status, substitute_id)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      req.id,
      leave.positions[options.positionKey],
      WEDNESDAY,
      options.from,
      options.to,
      options.status,
      options.substitute ? leave.users[options.substitute] : null,
    ],
  );
  return rec.id;
}

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.leave_requests");
  await leave.asService("delete from public.substitutes");
});

describe("список замін працівника", () => {
  it("AC-SUBST-01: менеджер додає двох людей до порожнього списку", async () => {
    expect(await listFor("manager1@example.test", "teacher1@example.test")).toEqual([]);

    await addSubstitute("manager1@example.test", "teacher1@example.test", "assistant1@example.test");
    await addSubstitute("manager1@example.test", "teacher1@example.test", "teacher2@example.test");

    expect(await listFor("manager1@example.test", "teacher1@example.test")).toEqual([
      "assistant1@example.test",
      "teacher2@example.test",
    ]);
  });

  it("AC-SUBST-04: працівник бачить саме свій список", async () => {
    await addSubstitute("manager1@example.test", "teacher1@example.test", "assistant1@example.test");
    await addSubstitute("manager1@example.test", "teacher1@example.test", "teacher2@example.test");

    // teacher3 у списку немає — політика select віддає лише наявні пари.
    expect(await listFor("teacher1@example.test", "teacher1@example.test")).toEqual([
      "assistant1@example.test",
      "teacher2@example.test",
    ]);
  });

  it("AC-SUBST-12: працівник власного списку не змінює", async () => {
    await expect(
      addSubstitute("teacher1@example.test", "teacher1@example.test", "teacher2@example.test"),
    ).rejects.toThrow(/row-level security/);

    expect(await listFor("manager1@example.test", "teacher1@example.test")).toEqual([]);
  });

  it("AC-SUBST-13: менеджер чужих посад списку не змінює", async () => {
    await addSubstitute("manager1@example.test", "teacher1@example.test", "assistant1@example.test");
    await addSubstitute("manager1@example.test", "teacher1@example.test", "teacher2@example.test");

    // manager2 веде лише ДОДАТКОВУ посаду teacher1 — її теж досить за
    // припущенням PM («будь-який відповідальний менеджер будь-якої з посад»),
    // тому беремо менеджера, який не веде жодної: adminʼа тут немає, а
    // teacher2 — звичайний працівник.
    await expect(
      addSubstitute("teacher2@example.test", "teacher1@example.test", "teacher3@example.test"),
    ).rejects.toThrow(/row-level security/);

    expect(await listFor("manager1@example.test", "teacher1@example.test")).toEqual([
      "assistant1@example.test",
      "teacher2@example.test",
    ]);
  });

  it("працівник не може бути у власному списку", async () => {
    // Припущення PM; межу тримає обмеження таблиці, а не сторінка.
    await expect(
      addSubstitute("manager1@example.test", "teacher1@example.test", "teacher1@example.test"),
    ).rejects.toThrow(/substitutes_not_self_check/);
  });
});

describe("заміна в записі заявки", () => {
  beforeEach(async () => {
    await addSubstitute("manager1@example.test", "teacher1@example.test", "assistant1@example.test");
    await addSubstitute("manager1@example.test", "teacher1@example.test", "teacher2@example.test");
  });

  it("AC-SUBST-02: запис створено із заміною, і менеджер її бачить", async () => {
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", substitute: "assistant1@example.test" },
    ]);

    const seen = await leave.asUser<{ status: string; email: string | null }>(
      leave.users["manager1@example.test"],
      `select rec.status, p.email
         from public.leave_records as rec
         left join public.profiles as p on p.id = rec.substitute_id`,
    );
    expect(seen).toEqual([{ status: "awaiting", email: "assistant1@example.test" }]);
  });

  it("AC-SUBST-03: без заміни запис теж створюється", async () => {
    await submit("teacher1@example.test", [{ position: "teacher1@example.test:main" }]);

    const [row] = await leave.asService<{ substitute_id: string | null }>(
      "select substitute_id from public.leave_records",
    );
    expect(row.substitute_id).toBeNull();
  });

  it("AC-SUBST-04: заміну поза списком база не приймає", async () => {
    await expect(
      submit("teacher1@example.test", [
        { position: "teacher1@example.test:main", substitute: "teacher3@example.test" },
      ]),
    ).rejects.toThrow("This substitute is not on your list");

    const [row] = await leave.asService<{ count: string }>(
      "select count(*)::text as count from public.leave_records",
    );
    expect(Number(row.count)).toBe(0);
  });

  it("AC-SUBST-10: заміна бачить запис, де підміняє", async () => {
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", substitute: "assistant1@example.test" },
    ]);

    const seen = await leave.asUser<{ on_date: string; status: string }>(
      leave.users["assistant1@example.test"],
      "select to_char(on_date, 'YYYY-MM-DD') as on_date, status from public.leave_records",
    );
    expect(seen).toEqual([{ on_date: WEDNESDAY, status: "awaiting" }]);
  });

  it("AC-SUBST-14: неавторизований записів не бачить", async () => {
    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", substitute: "assistant1@example.test" },
    ]);

    // Сторінку «Мої заміни» неавторизованому не віддає proxy; база — друга лінія.
    await expect(leave.asAnon("select * from public.leave_records")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("AC-SUBST-15: хто нікого не підміняє — не бачить чужих записів", async () => {
    await submit("teacher1@example.test", [{ position: "teacher1@example.test:main" }]);

    const seen = await leave.asUser(
      leave.users["assistant1@example.test"],
      "select id from public.leave_records",
    );
    expect(seen).toEqual([]);
  });
});

describe("зайнята заміна", () => {
  beforeEach(async () => {
    await addSubstitute("manager1@example.test", "teacher1@example.test", "assistant1@example.test");
  });

  it("AC-SUBST-05: власний запис заміни в цей час", async () => {
    await seedRecord({
      employee: "assistant1@example.test",
      positionKey: "assistant1@example.test:main",
      status: "awaiting",
      from: "09:00",
      to: "11:00",
    });

    await expect(
      submit("teacher1@example.test", [
        { position: "teacher1@example.test:main", substitute: "assistant1@example.test" },
      ]),
    ).rejects.toThrow(
      `assistant1@example.test is not available at this time: ${WEDNESDAY} 09:00–11:00`,
    );
  });

  it("AC-SUBST-06: заміна вже підміняє іншого працівника", async () => {
    await seedRecord({
      employee: "teacher2@example.test",
      positionKey: "teacher2@example.test:main",
      status: "approved",
      from: "10:00",
      to: "12:00",
      substitute: "assistant1@example.test",
    });

    await expect(
      submit("teacher1@example.test", [
        { position: "teacher1@example.test:main", substitute: "assistant1@example.test" },
      ]),
    ).rejects.toThrow(
      `assistant1@example.test is not available at this time: ${WEDNESDAY} 10:00–12:00`,
    );
  });

  it("AC-SUBST-07: відхилений запис зайнятості не створює", async () => {
    await seedRecord({
      employee: "assistant1@example.test",
      positionKey: "assistant1@example.test:main",
      status: "rejected",
      from: "09:00",
      to: "11:00",
    });

    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", substitute: "assistant1@example.test" },
    ]);

    const seen = await leave.asService<{ email: string | null }>(
      `select p.email from public.leave_records as rec
         join public.profiles as p on p.id = rec.substitute_id`,
    );
    expect(seen).toEqual([{ email: "assistant1@example.test" }]);
  });

  it("дотик межами зайнятістю не є", async () => {
    // Та сама межа, що й для перетину власних записів: 11:00–15:30 після
    // 09:00–11:00 проходить. Строгі нерівності в substitute_busy_at.
    await seedRecord({
      employee: "assistant1@example.test",
      positionKey: "assistant1@example.test:main",
      status: "approved",
      from: "09:00",
      to: "11:00",
    });

    await submit("teacher1@example.test", [
      { position: "teacher1@example.test:main", from: "11:00", to: "15:30", substitute: "assistant1@example.test" },
    ]);

    const [row] = await leave.asService<{ count: string }>(
      "select count(*)::text as count from public.leave_records where substitute_id is not null",
    );
    expect(Number(row.count)).toBe(1);
  });

  it("заявка з кількох записів відкочується цілком, якщо заміна зайнята", async () => {
    // AC-LEAVE-16 і AC-SUBST-05 разом: другий запис із зайнятою заміною не
    // лишає в базі й першого.
    await seedRecord({
      employee: "assistant1@example.test",
      positionKey: "assistant1@example.test:main",
      status: "approved",
      from: "09:00",
      to: "11:00",
    });

    await expect(
      submit("teacher1@example.test", [
        { position: "teacher1@example.test:main", from: "08:30", to: "09:00" },
        { position: "teacher1@example.test:main", from: "09:00", to: "15:30", substitute: "assistant1@example.test" },
      ]),
    ).rejects.toThrow("is not available at this time");

    // Рахуємо лише записи teacher1: запис самої заміни, яким ми створили
    // зайнятість, у базі лишається.
    const [row] = await leave.asService<{ count: string }>(
      `select count(*)::text as count
         from public.leave_records as rec
         join public.positions as pos on pos.id = rec.position_id
        where pos.employee_id = $1`,
      [leave.users["teacher1@example.test"]],
    );
    expect(Number(row.count)).toBe(0);
  });
});
