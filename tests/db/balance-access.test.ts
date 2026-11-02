/**
 * Залишки на рівні бази: перенесені дні, навчальний рік і хто чиї залишки бачить.
 *
 * Відмови тут тримають політики `leave_carryover_select_own_managed_or_admin`,
 * `leave_records_select_balance_scope` і хелпер `private.manages_employee`,
 * а не код сторінки: прибери їх — і ці тести впадуть. Мутаційну таблицю
 * наведено в описі PR.
 *
 * Дані лише синтетичні: supabase/demo-users.json і supabase/demo-positions.json.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

/** 2026 означає навчальний рік 2026–2027 (1.09.2026 – 31.08.2027). */
const YEAR = 2026;

/** Погоджений запис із уже записаною часткою дня — так його лишає погодження. */
async function seedApproved(input: {
  employee: string;
  position: string;
  date: string;
  type?: string;
  onType: string;
  unpaid?: string;
}) {
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type)
     values ($1, $2) returning id`,
    [leave.users[input.employee], input.type ?? "personal"],
  );
  await leave.asService(
    `insert into public.leave_records
       (request_id, position_id, on_date, starts_at, ends_at, status, days_on_type, days_unpaid)
     values ($1, $2, $3, '08:30', '15:30', 'approved', $4, $5)`,
    [req.id, leave.positions[input.position], input.date, input.onType, input.unpaid ?? "0.00"],
  );
}

/** Два цілі дні — це два записи на різні дати: один запис ніколи не більший за 1.00. */
async function seedTwoWholeDays(employee: string, position: string) {
  for (const date of ["2026-11-02", "2026-11-03"]) {
    await seedApproved({ employee, position, date, onType: "1.00" });
  }
}

type BalanceRow = { leave_type: string; carried_over: string; used: string };

/** Залишки працівника очима конкретного користувача. */
function balanceSeenBy(viewer: string, employee: string, year = YEAR) {
  return leave.asUser<BalanceRow>(
    leave.users[viewer],
    "select leave_type, carried_over::text, used::text from public.employee_balance($1, $2::smallint)",
    [leave.users[employee], year],
  );
}

const pick = (rows: BalanceRow[], type: string) => rows.find((r) => r.leave_type === type);

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.leave_requests");
  await leave.asService("delete from public.leave_carryover");
});

describe("перенесені дні", () => {
  it("AC-BALANCE-11: перенесені 5.00 видно в наступному навчальному році", async () => {
    await leave.asService(
      `insert into public.leave_carryover (employee_id, leave_type, school_year, days)
       values ($1, 'sick', 2027, 5.00)`,
      [leave.users["teacher1@example.test"]],
    );

    const rows = await balanceSeenBy("teacher1@example.test", "teacher1@example.test", 2027);

    expect(pick(rows, "sick")?.carried_over).toBe("5.00");
    expect(pick(rows, "sick")?.used).toBe("0.00");
    // Торік перенесення ще немає.
    const before = await balanceSeenBy("teacher1@example.test", "teacher1@example.test", 2026);
    expect(pick(before, "sick")?.carried_over).toBe("0.00");
  });

  it("AC-BALANCE-01: без записів і перенесень усюди нулі", async () => {
    const rows = await balanceSeenBy("teacher1@example.test", "teacher1@example.test");

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.used).toBe("0.00");
      expect(row.carried_over).toBe("0.00");
    }
  });
});

describe("навчальний рік запису", () => {
  it("AC-BALANCE-21: рік визначає дата запису, а не дата рішення", async () => {
    // 30 серпня 2027 — це ще 2026–2027, хоч би коли його погодили.
    await seedApproved({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: "2027-08-30",
      type: "sick",
      onType: "1.00",
    });

    const thisYear = await balanceSeenBy("teacher1@example.test", "teacher1@example.test", 2026);
    const nextYear = await balanceSeenBy("teacher1@example.test", "teacher1@example.test", 2027);

    expect(pick(thisYear, "sick")?.used).toBe("1.00");
    expect(pick(nextYear, "sick")?.used).toBe("0.00");
  });

  it("AC-BALANCE-22: заявка через межу років ділиться між роками", async () => {
    for (const [date, year] of [
      ["2027-08-31", 2026],
      ["2027-09-01", 2027],
    ] as const) {
      await seedApproved({
        employee: "teacher1@example.test",
        position: "teacher1@example.test:main",
        date,
        onType: "1.00",
      });
      void year;
    }

    const first = await balanceSeenBy("teacher1@example.test", "teacher1@example.test", 2026);
    const second = await balanceSeenBy("teacher1@example.test", "teacher1@example.test", 2027);

    expect(pick(first, "personal")?.used).toBe("1.00");
    expect(pick(second, "personal")?.used).toBe("1.00");
  });

  it("AC-BALANCE-04, AC-BALANCE-07: непогоджений запис балансу не чіпає", async () => {
    const [req] = await leave.asService<{ id: string }>(
      `insert into public.leave_requests (employee_id, leave_type)
       values ($1, 'personal') returning id`,
      [leave.users["teacher1@example.test"]],
    );
    for (const status of ["awaiting", "rejected", "cancelled", "returned"]) {
      await leave.asService(
        `insert into public.leave_records
           (request_id, position_id, on_date, starts_at, ends_at, status)
         values ($1, $2, $3, '08:30', '15:30', $4)`,
        [req.id, leave.positions["teacher1@example.test:main"], "2026-11-02", status],
      );
    }

    const rows = await balanceSeenBy("teacher1@example.test", "teacher1@example.test");

    expect(pick(rows, "personal")?.used).toBe("0.00");
  });
});

describe("поділ рахується у двох типах", () => {
  it("AC-BALANCE-10: 0.50 Personal leave + 0.50 Unpaid leave", async () => {
    await seedApproved({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: "2026-11-02",
      type: "personal",
      onType: "0.50",
      unpaid: "0.50",
    });

    const rows = await balanceSeenBy("teacher1@example.test", "teacher1@example.test");

    expect(pick(rows, "personal")?.used).toBe("0.50");
    expect(pick(rows, "unpaid")?.used).toBe("0.50");
  });

  it("AC-BALANCE-19: за нульового залишку весь день іде в Unpaid leave", async () => {
    await seedApproved({
      employee: "teacher1@example.test",
      position: "teacher1@example.test:main",
      date: "2026-11-02",
      type: "personal",
      onType: "0.00",
      unpaid: "1.00",
    });

    const rows = await balanceSeenBy("teacher1@example.test", "teacher1@example.test");

    expect(pick(rows, "personal")?.used).toBe("0.00");
    expect(pick(rows, "unpaid")?.used).toBe("1.00");
  });
});

describe("обмеження на частку дня", () => {
  it("одна дата ніколи не більша за 1.00 дня", async () => {
    // Припущення PM: «One date never counts as more than 1.00 day». Обмеження
    // бази — остання лінія: воно вже впіймало хибні тестові дані в цьому файлі.
    const [req] = await leave.asService<{ id: string }>(
      `insert into public.leave_requests (employee_id, leave_type)
       values ($1, 'personal') returning id`,
      [leave.users["teacher1@example.test"]],
    );

    await expect(
      leave.asService(
        `insert into public.leave_records
           (request_id, position_id, on_date, starts_at, ends_at, status, days_on_type, days_unpaid)
         values ($1, $2, '2026-11-02', '08:30', '15:30', 'approved', 0.60, 0.60)`,
        [req.id, leave.positions["teacher1@example.test:main"]],
      ),
    ).rejects.toThrow();

    const [{ count }] = await leave.asService<{ count: string }>(
      "select count(*)::text as count from public.leave_records",
    );
    expect(Number(count)).toBe(0);
  });

  it("від'ємних днів база не приймає", async () => {
    const [req] = await leave.asService<{ id: string }>(
      `insert into public.leave_requests (employee_id, leave_type)
       values ($1, 'personal') returning id`,
      [leave.users["teacher1@example.test"]],
    );

    await expect(
      leave.asService(
        `insert into public.leave_records
           (request_id, position_id, on_date, starts_at, ends_at, status, days_on_type, days_unpaid)
         values ($1, $2, '2026-11-02', '08:30', '15:30', 'approved', -0.50, 0.00)`,
        [req.id, leave.positions["teacher1@example.test:main"]],
      ),
    ).rejects.toThrow();
  });
});

describe("хто чиї залишки бачить", () => {
  it("AC-BALANCE-20: менеджер додаткової посади бачить повний баланс", async () => {
    // Запис на ОСНОВНІЙ посаді, яку веде manager1. manager2 веде лише додаткову,
    // але має побачити ті самі числа, що й сам працівник.
    await seedTwoWholeDays("teacher1@example.test", "teacher1@example.test:main");

    const byEmployee = await balanceSeenBy("teacher1@example.test", "teacher1@example.test");
    const byManager2 = await balanceSeenBy("manager2@example.test", "teacher1@example.test");

    expect(pick(byEmployee, "personal")?.used).toBe("2.00");
    expect(pick(byManager2, "personal")?.used).toBe("2.00");
  });

  it("AC-BALANCE-12: менеджер, який не веде жодної посади працівника, чисел не бачить", async () => {
    await seedTwoWholeDays("teacher1@example.test", "teacher1@example.test:main");
    await leave.asService(
      `insert into public.leave_carryover (employee_id, leave_type, school_year, days)
       values ($1, 'personal', $2, 3.00)`,
      [leave.users["teacher1@example.test"], YEAR],
    );

    // Прибираємо manager1 з обох посад teacher1 — тепер він не веде жодної.
    await leave.asService(
      `delete from public.position_managers
        where manager_id = $1
          and position_id in (select id from public.positions where employee_id = $2)`,
      [leave.users["manager1@example.test"], leave.users["teacher1@example.test"]],
    );

    const seen = await balanceSeenBy("manager1@example.test", "teacher1@example.test");

    // «The balances are not shown» — жодного рядка, а не нулі, які можна
    // сплутати зі справжніми числами.
    expect(seen).toEqual([]);

    await leave.asService(
      `insert into public.position_managers (position_id, manager_id)
       select id, $1 from public.positions
        where employee_id = $2 and kind = 'main'`,
      [leave.users["manager1@example.test"], leave.users["teacher1@example.test"]],
    );
  });

  it("AC-BALANCE-13: працівник чужих залишків не бачить", async () => {
    await seedTwoWholeDays("teacher1@example.test", "teacher1@example.test:main");

    const seen = await balanceSeenBy("teacher2@example.test", "teacher1@example.test");

    expect(seen).toEqual([]);
  });

  it("адміністратор бачить залишки будь-кого", async () => {
    await seedTwoWholeDays("teacher1@example.test", "teacher1@example.test:main");

    const seen = await balanceSeenBy("admin@example.test", "teacher1@example.test");

    expect(pick(seen, "personal")?.used).toBe("2.00");
  });

  it("анонімний відвідувач перенесень не бачить", async () => {
    await expect(leave.asAnon("select days from public.leave_carryover")).rejects.toThrow();
  });

  it("перенесення не змінити з застосунку", async () => {
    await leave.asService(
      `insert into public.leave_carryover (employee_id, leave_type, school_year, days)
       values ($1, 'sick', $2, 5.00)`,
      [leave.users["teacher1@example.test"], YEAR],
    );

    // Жодного grant update чи insert у authenticated немає.
    await expect(
      leave.asUser(
        leave.users["teacher1@example.test"],
        "update public.leave_carryover set days = 99.00 where employee_id = $1",
        [leave.users["teacher1@example.test"]],
      ),
    ).rejects.toThrow();

    const [row] = await leave.asService<{ days: string }>(
      "select days::text from public.leave_carryover where employee_id = $1",
      [leave.users["teacher1@example.test"]],
    );
    expect(row.days).toBe("5.00");
  });
});
