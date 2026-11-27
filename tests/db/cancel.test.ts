/**
 * Зріз leave-cancellation на рівні бази: запит на скасування, рішення менеджера,
 * скасування менеджером і наслідки для залишку та шкільного календаря.
 *
 * Чому саме тут, а не лише в чистій логіці: усі межі цього зрізу тримає база —
 * політики (`AC-CANCEL-10`, `AC-CANCEL-11`), частковий унікальний індекс
 * (`AC-CANCEL-06`) і функції. Повернення днів (`AC-CANCEL-02`, `AC-CANCEL-07`)
 * перевіряємо звіркою `employee_balance` ДО і ПІСЛЯ, а не припущенням.
 *
 * Дані лише синтетичні: supabase/demo-users.json і supabase/demo-positions.json.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CANCEL_ALREADY_REQUESTED,
  CANCEL_IN_THE_PAST,
  CANCEL_ONLY_OWN,
} from "@/lib/leave/cancel";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

/** Київська дата «сьогодні» — те саме джерело, що й у функціях міграції. */
async function kyivToday() {
  const [row] = await leave.asService<{ today: string }>(
    "select to_char((now() at time zone 'Europe/Kyiv')::date, 'YYYY-MM-DD') as today",
  );
  return row.today;
}

/** Дата через N днів від київського «сьогодні». */
async function dayShift(days: number) {
  const [row] = await leave.asService<{ d: string }>(
    `select to_char(((now() at time zone 'Europe/Kyiv')::date + ($1 || ' days')::interval)::date,
            'YYYY-MM-DD') as d`,
    [String(days)],
  );
  return row.d;
}

/**
 * Погоджений запис із порахованими частками дня — як після
 * `decide_leave_record` зі зрізу WS6.
 */
async function seedApproved(options: {
  employee: string;
  positionKey: string;
  date: string;
  leaveType?: string;
  daysOnType?: number;
  daysUnpaid?: number;
}) {
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type)
     values ($1, $2) returning id`,
    [leave.users[options.employee], options.leaveType ?? "personal"],
  );
  const [rec] = await leave.asService<{ id: string }>(
    `insert into public.leave_records
       (request_id, position_id, on_date, starts_at, ends_at, status, days_on_type, days_unpaid)
     values ($1, $2, $3, '08:30', '15:30', 'approved', $4, $5) returning id`,
    [
      req.id,
      leave.positions[options.positionKey],
      options.date,
      options.daysOnType ?? 1,
      options.daysUnpaid ?? 0,
    ],
  );
  return rec.id;
}

function requestCancel(actor: string, recordId: string, reason: string) {
  return leave.asUser(leave.users[actor], "select public.request_record_cancellation($1, $2)", [
    recordId,
    reason,
  ]);
}

function decideCancel(actor: string, recordId: string, decision: string, comment: string | null) {
  return leave.asUser(
    leave.users[actor],
    "select public.decide_record_cancellation($1, $2, $3)",
    [recordId, decision, comment],
  );
}

async function statusOf(recordId: string) {
  const [row] = await leave.asService<{ status: string }>(
    "select status from public.leave_records where id = $1",
    [recordId],
  );
  return row.status;
}

/** Використано днів цього типу — через ту саму функцію, що й сторінка залишків. */
async function used(employee: string, leaveType: string, schoolYear: number) {
  // Через публічну обгортку й від імені адміністратора — так само, як сторінка залишків.
  const rows = await leave.asUser<{ leave_type: string; used: string }>(
    leave.users["admin@example.test"],
    "select leave_type, used::text as used from public.employee_balance($1, $2::smallint)",
    [leave.users[employee], String(schoolYear)],
  );
  return Number(rows.find((r) => r.leave_type === leaveType)?.used ?? 0);
}

/** Навчальний рік дати: вересень і далі — рік дати, інакше рік мінус один. */
function schoolYearOf(date: string) {
  const [year, month] = date.split("-").map(Number);
  return month >= 9 ? year : year - 1;
}

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.leave_requests");
  await leave.asService("delete from public.school_closures");
});

describe("працівник просить скасувати погоджений запис", () => {
  it("AC-CANCEL-01: запит лишає запис погодженим і видно менеджерові", async () => {
    const date = await dayShift(9);
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date,
    });

    await requestCancel("teacher1@example.test", record, "Plans changed");

    expect(await statusOf(record)).toBe("approved");

    // Менеджер посади бачить запит і причину — без фільтра в SQL, відсікає політика.
    const seen = await leave.asUser<{ reason: string; decision: string | null }>(
      leave.users["manager1@example.test"],
      "select reason, decision from public.leave_cancellations",
    );
    expect(seen).toEqual([{ reason: "Plans changed", decision: null }]);
  });

  it("AC-CANCEL-05: запис у минулому не скасовується", async () => {
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date: await dayShift(-4),
    });

    await expect(
      requestCancel("teacher1@example.test", record, "Plans changed"),
    ).rejects.toThrow(CANCEL_IN_THE_PAST);

    expect(await statusOf(record)).toBe("approved");
  });

  it("AC-CANCEL-05: запис на сьогодні скасувати ще можна", async () => {
    // Межа з AC — «today or later», тобто нестрога: саме сьогоднішня дата
    // відрізняє `<` від `<=` у перевірці.
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date: await kyivToday(),
    });

    await requestCancel("teacher1@example.test", record, "Plans changed");

    const [row] = await leave.asService<{ count: string }>(
      "select count(*)::text as count from public.leave_cancellations where record_id = $1",
      [record],
    );
    expect(Number(row.count)).toBe(1);
  });

  it("AC-CANCEL-06: другий запит не створюється", async () => {
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date: await dayShift(9),
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    await expect(
      requestCancel("teacher1@example.test", record, "Plans changed again"),
    ).rejects.toThrow(CANCEL_ALREADY_REQUESTED);

    const [row] = await leave.asService<{ count: string }>(
      "select count(*)::text as count from public.leave_cancellations where record_id = $1",
      [record],
    );
    expect(Number(row.count)).toBe(1);
  });

  it("AC-CANCEL-10: чужий запис скасувати не можна", async () => {
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date: await dayShift(9),
    });

    await expect(
      requestCancel("teacher2@example.test", record, "Not mine"),
    ).rejects.toThrow(CANCEL_ONLY_OWN);

    expect(await statusOf(record)).toBe("approved");
  });

  it("AC-CANCEL-12: неавторизований не бачить запитів на скасування", async () => {
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date: await dayShift(9),
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    await expect(leave.asAnon("select * from public.leave_cancellations")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("менеджер вирішує запит на скасування", () => {
  it("AC-CANCEL-02: підтвердження скасовує запис і повертає дні", async () => {
    const date = await dayShift(9);
    const year = schoolYearOf(date);
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date,
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    expect(await used("teacher1@example.test", "personal", year)).toBe(1);

    await decideCancel("manager1@example.test", record, "confirmed", null);

    expect(await statusOf(record)).toBe("cancelled");
    expect(await used("teacher1@example.test", "personal", year)).toBe(0);
  });

  it("AC-CANCEL-07: розділений запис повертає обидві частини", async () => {
    const date = await dayShift(9);
    const year = schoolYearOf(date);
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date,
      daysOnType: 0.5,
      daysUnpaid: 0.5,
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    expect(await used("teacher1@example.test", "personal", year)).toBe(0.5);
    expect(await used("teacher1@example.test", "unpaid", year)).toBe(0.5);

    await decideCancel("manager1@example.test", record, "confirmed", null);

    expect(await used("teacher1@example.test", "personal", year)).toBe(0);
    expect(await used("teacher1@example.test", "unpaid", year)).toBe(0);
  });

  it("AC-CANCEL-03: відхилення з коментарем лишає запис погодженим", async () => {
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date: await dayShift(9),
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    await decideCancel("manager1@example.test", record, "declined", "Exam week");

    expect(await statusOf(record)).toBe("approved");

    const [row] = await leave.asService<{ decision: string; comment: string }>(
      "select decision, comment from public.leave_cancellations where record_id = $1",
      [record],
    );
    expect(row).toEqual({ decision: "declined", comment: "Exam week" });
  });

  it("AC-CANCEL-04: відхилення без коментаря не приймається", async () => {
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date: await dayShift(9),
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    await expect(decideCancel("manager1@example.test", record, "declined", "  ")).rejects.toThrow(
      "Tell the employee why the cancellation is declined",
    );

    const [row] = await leave.asService<{ decision: string | null }>(
      "select decision from public.leave_cancellations where record_id = $1",
      [record],
    );
    expect(row.decision).toBeNull();
  });

  it("AC-CANCEL-11: менеджер чужої посади нічого не змінює", async () => {
    const date = await dayShift(9);
    const year = schoolYearOf(date);
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date,
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    // manager2 веде лише ДОДАТКОВУ посаду teacher1, тож цього запису не вирішує.
    //
    // Повідомлення — «No cancellation has been requested», а не «You cannot
    // decide», і це правильно: політика select ховає від нього сам рядок запиту,
    // тож функція його просто не бачить. Так чужі дані не підтверджуються навіть
    // текстом помилки (той самий підхід, що в decide_leave_record).
    await expect(decideCancel("manager2@example.test", record, "confirmed", null)).rejects.toThrow(
      "No cancellation has been requested",
    );

    expect(await statusOf(record)).toBe("approved");
    expect(await used("teacher1@example.test", "personal", year)).toBe(1);

    const [row] = await leave.asService<{ decision: string | null }>(
      "select decision from public.leave_cancellations where record_id = $1",
      [record],
    );
    expect(row.decision).toBeNull();
  });
});

describe("прямий запит повз функцію", () => {
  it("AC-CANCEL-02: підтвердження без скасування запису база не приймає", async () => {
    // Колонковий grant дозволяє менеджеру поставити decision напряму. Якби це
    // проходило, запит виглядав би вирішеним, а дні не повернулися б —
    // знайшло рев'ю CodeRabbit на PR 112. Тримає відкладений constraint
    // trigger, тож падає вже на commit.
    const date = await dayShift(9);
    const year = schoolYearOf(date);
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date,
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    await expect(
      leave.asUser(
        leave.users["manager1@example.test"],
        `update public.leave_cancellations
            set decision = 'confirmed', decided_by = $2, decided_at = now()
          where record_id = $1 and decision is null`,
        [record, leave.users["manager1@example.test"]],
      ),
    ).rejects.toThrow("A confirmed cancellation must cancel the record");

    expect(await statusOf(record)).toBe("approved");
    expect(await used("teacher1@example.test", "personal", year)).toBe(1);
  });
});

describe("менеджер скасовує запис сам", () => {
  it("AC-CANCEL-08: скасування з приміткою видно працівникові", async () => {
    const date = await dayShift(9);
    const year = schoolYearOf(date);
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date,
    });

    await leave.asUser(
      leave.users["manager1@example.test"],
      "select public.cancel_record_with_note($1, $2)",
      [record, "Event moved to January"],
    );

    expect(await statusOf(record)).toBe("cancelled");
    expect(await used("teacher1@example.test", "personal", year)).toBe(0);

    const seen = await leave.asUser<{ comment: string }>(
      leave.users["teacher1@example.test"],
      "select comment from public.leave_cancellations where record_id = $1",
      [record],
    );
    expect(seen).toEqual([{ comment: "Event moved to January" }]);
  });

  it("AC-CANCEL-09: без примітки запис лишається погодженим", async () => {
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date: await dayShift(9),
    });

    await expect(
      leave.asUser(
        leave.users["manager1@example.test"],
        "select public.cancel_record_with_note($1, $2)",
        [record, "   "],
      ),
    ).rejects.toThrow("Tell the employee why the record is cancelled");

    expect(await statusOf(record)).toBe("approved");
  });
});

describe("наслідки скасування", () => {
  it("AC-CANCEL-13: на звільнену дату можна додати закриття", async () => {
    const date = await dayShift(9);
    const record = await seedApproved({
      employee: "teacher1@example.test",
      positionKey: "teacher1@example.test:main",
      date,
    });
    await requestCancel("teacher1@example.test", record, "Plans changed");

    // Поки запис погоджений, дату тримає він (AC-CAL-07).
    await expect(
      leave.asUser(leave.users["admin@example.test"], "select public.add_school_closure($1, $2, $3, $4)", [
        "Staff day",
        date,
        date,
        null,
      ]),
    ).rejects.toThrow("These days have leave records and cannot be closed");

    await decideCancel("manager1@example.test", record, "confirmed", null);

    await leave.asUser(
      leave.users["admin@example.test"],
      "select public.add_school_closure($1, $2, $3, $4)",
      ["Staff day", date, date, null],
    );

    const closures = await leave.asService<{ name: string }>(
      "select name from public.school_closures where starts_on = $1",
      [date],
    );
    expect(closures).toEqual([{ name: "Staff day" }]);
  });
});
