/**
 * Зріз leave-decision на рівні бази: хто може вирішити запис, що бачить історія
 * і які тексти дає public.decide_leave_record.
 *
 * Кожен відмовний тест має падати, якщо прибрати політику
 * leave_records_update_decision або хелпер private.decides_record, —
 * мутаційну таблицю наведено в описі PR.
 *
 * Дані лише синтетичні: supabase/demo-users.json і supabase/demo-positions.json.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

const MONDAY = "2026-11-02";

/** Запис у статусі «на розгляді» від імені service_role — готуємо стан, не перевіряємо його. */
async function seedRecord(employee: string, positionKey: string, comment: string | null = null) {
  const [req] = await leave.asService<{ id: string }>(
    `insert into public.leave_requests (employee_id, leave_type, comment)
     values ($1, 'sick', $2) returning id`,
    [leave.users[employee], comment],
  );
  const [rec] = await leave.asService<{ id: string }>(
    `insert into public.leave_records (request_id, position_id, on_date, starts_at, ends_at)
     values ($1, $2, $3, '08:30', '15:30') returning id`,
    [req.id, leave.positions[positionKey], MONDAY],
  );
  return rec.id;
}

function decide(actor: string, recordId: string, decision: string, comment: string | null = null) {
  return leave.asUser(
    leave.users[actor],
    "select public.decide_leave_record($1, $2, $3)",
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

async function decisionCount() {
  const [row] = await leave.asService<{ count: string }>(
    "select count(*)::text as count from public.leave_decisions",
  );
  return Number(row.count);
}

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

beforeEach(async () => {
  await leave.asService("delete from public.leave_requests");
});

describe("менеджер вирішує записи своїх посад", () => {
  it("AC-DECIDE-01: список менеджера містить запис його посади й не містить чужої", async () => {
    // Основну посаду teacher1 веде manager1, додаткову — manager2.
    const main = await seedRecord("teacher1@example.test", "teacher1@example.test:main");
    await seedRecord("teacher1@example.test", "teacher1@example.test:additional");

    // Без фільтра в SQL: відсікати має політика select.
    const seen = await leave.asUser<{ id: string }>(
      leave.users["manager1@example.test"],
      "select id from public.leave_records",
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBe(main);
  });

  it("AC-DECIDE-02: погодження одного запису не чіпає другого", async () => {
    const first = await seedRecord("teacher1@example.test", "teacher1@example.test:main");
    const second = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await decide("manager1@example.test", first, "approved");

    expect(await statusOf(first)).toBe("approved");
    expect(await statusOf(second)).toBe("awaiting");
  });

  it("AC-DECIDE-01: менеджер бачить, чий це запис", async () => {
    // Основний сценарій, крок 2. Політика profiles зі зрізу 1 віддавала лише
    // власний профіль — у списку стояло б «—» замість імені працівника.
    await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    const seen = await leave.asUser<{ full_name: string; email: string }>(
      leave.users["manager1@example.test"],
      `select p.full_name, p.email
         from public.leave_records as rec
         join public.positions as pos on pos.id = rec.position_id
         join public.profiles as p on p.id = pos.employee_id`,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].email).toBe("teacher1@example.test");
    expect(seen[0].full_name).toBeTruthy();
  });

  it("менеджер не бачить профілів поза своїми посадами", async () => {
    // manager2 веде додаткову посаду teacher1 і основну teacher2, тож бачить
    // їх і себе. Адміністратор і manager1 — поза його посадами.
    const seen = await leave.asUser<{ email: string }>(
      leave.users["manager2@example.test"],
      "select email from public.profiles order by email",
    );

    expect(seen.map((r) => r.email)).toEqual([
      "manager2@example.test",
      "teacher1@example.test",
      "teacher2@example.test",
    ]);
  });

  it("AC-DECIDE-11: із трьох записів погоджений іде в History, двоє лишаються", async () => {
    const ids = [
      await seedRecord("teacher1@example.test", "teacher1@example.test:main"),
      await seedRecord("teacher1@example.test", "teacher1@example.test:main"),
      await seedRecord("teacher1@example.test", "teacher1@example.test:main"),
    ];

    await decide("manager1@example.test", ids[0], "approved");

    const stillAwaiting = await leave.asUser<{ id: string }>(
      leave.users["manager1@example.test"],
      "select id from public.leave_records where status = 'awaiting'",
    );
    const history = await leave.asUser<{ record_id: string }>(
      leave.users["manager1@example.test"],
      "select record_id from public.leave_decisions where decided_by = $1",
      [leave.users["manager1@example.test"]],
    );

    expect(stillAwaiting).toHaveLength(2);
    expect(history).toHaveLength(1);
    expect(history[0].record_id).toBe(ids[0]);
  });

  it("AC-DECIDE-03: відхилення ставить статус Rejected", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await decide("manager1@example.test", id, "rejected");

    expect(await statusOf(id)).toBe("rejected");
  });

  it("AC-DECIDE-05: повернення з коментарем — статус і коментар видно працівнику", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await decide("manager1@example.test", id, "returned", "Enter hours instead of a whole day");

    expect(await statusOf(id)).toBe("returned");
    const seen = await leave.asUser<{ comment: string }>(
      leave.users["teacher1@example.test"],
      "select comment from public.leave_decisions where record_id = $1",
      [id],
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].comment).toBe("Enter hours instead of a whole day");
  });

  it("AC-DECIDE-24: коментар при погодженні працівник бачить", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await decide("manager1@example.test", id, "approved", "Get well soon");

    const seen = await leave.asUser<{ comment: string }>(
      leave.users["teacher1@example.test"],
      "select comment from public.leave_decisions where record_id = $1",
      [id],
    );
    expect(seen[0].comment).toBe("Get well soon");
  });

  it("AC-DECIDE-23: коментар при відхиленні працівник бачить", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await decide("manager1@example.test", id, "rejected", "Not enough staff that day");

    const seen = await leave.asUser<{ comment: string }>(
      leave.users["teacher1@example.test"],
      "select comment from public.leave_decisions where record_id = $1",
      [id],
    );
    expect(seen[0].comment).toBe("Not enough staff that day");
  });

  it("AC-DECIDE-20: менеджер бачить коментар працівника до заявки", async () => {
    await seedRecord("teacher1@example.test", "teacher1@example.test:main", "Doctor's appointment");

    const seen = await leave.asUser<{ comment: string }>(
      leave.users["manager1@example.test"],
      "select comment from public.leave_requests",
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].comment).toBe("Doctor's appointment");
  });
});

describe("кому вирішувати не можна", () => {
  it("AC-DECIDE-04: повернення без коментаря не змінює статус", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await expect(decide("manager1@example.test", id, "returned", null)).rejects.toThrow(
      "Tell the employee what to fix",
    );

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);
  });

  it("AC-DECIDE-07: другий менеджер після рішення першого", async () => {
    // Основну посаду teacher2 ведуть обидва менеджери.
    const id = await seedRecord("teacher2@example.test", "teacher2@example.test:main");
    await decide("manager1@example.test", id, "approved");

    await expect(decide("manager2@example.test", id, "rejected")).rejects.toThrow(
      "Another manager has already decided: Approved",
    );

    expect(await statusOf(id)).toBe("approved");
    expect(await decisionCount()).toBe(1);
  });

  it("AC-DECIDE-08: менеджер чужої посади рішення не зберігає", async () => {
    // manager2 веде лише додаткову посаду teacher1; це запис основної.
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await expect(decide("manager2@example.test", id, "approved")).rejects.toThrow();

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);
  });

  it("AC-DECIDE-09: працівник не погодить власний запис", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await expect(decide("teacher1@example.test", id, "approved")).rejects.toThrow();

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);
  });

  it("рядок у position_managers без ролі manager права не дає", async () => {
    // CodeRabbit на PR #25: саме лише членство в position_managers не має
    // робити людину тим, хто вирішує. Роль перевіряє private.decides_record.
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");
    await leave.asService(
      "insert into public.position_managers (position_id, manager_id) values ($1, $2)",
      [leave.positions["teacher1@example.test:main"], leave.users["teacher2@example.test"]],
    );

    await expect(decide("teacher2@example.test", id, "approved")).rejects.toThrow();

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);

    await leave.asService("delete from public.position_managers where manager_id = $1", [
      leave.users["teacher2@example.test"],
    ]);
  });

  it("AC-DECIDE-18: менеджер не вирішує власний запис", async () => {
    // manager1 — відповідальний менеджер власної основної посади.
    const id = await seedRecord("manager1@example.test", "manager1@example.test:main");

    await expect(decide("manager1@example.test", id, "approved")).rejects.toThrow(
      "Your own record is decided by an administrator",
    );

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);
  });

  it("працівник не впише чуже ім'я під рішення", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await expect(
      leave.asUser(
        leave.users["teacher1@example.test"],
        `insert into public.leave_decisions (record_id, decided_by, decision)
         values ($1, $2, 'approved')`,
        [id, leave.users["manager1@example.test"]],
      ),
    ).rejects.toThrow();

    expect(await decisionCount()).toBe(0);
  });

  it("анонімний відвідувач історії рішень не бачить", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");
    await decide("manager1@example.test", id, "approved");

    await expect(leave.asAnon("select id from public.leave_decisions")).rejects.toThrow();
  });
});

describe("адміністратор", () => {
  it("AC-DECIDE-10: адміністратор вирішує запис посади, якою не керує", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await decide("admin@example.test", id, "approved");

    expect(await statusOf(id)).toBe("approved");
    const [row] = await leave.asService<{ decided_by: string }>(
      "select decided_by from public.leave_decisions where record_id = $1",
      [id],
    );
    expect(row.decided_by).toBe(leave.users["admin@example.test"]);
  });

  it("AC-DECIDE-19: власний запис менеджера вирішує адміністратор", async () => {
    const id = await seedRecord("manager1@example.test", "manager1@example.test:main");

    await decide("admin@example.test", id, "approved");

    expect(await statusOf(id)).toBe("approved");
  });
});

describe("історія рішень", () => {
  it("AC-DECIDE-15: рядок історії має час, автора й рішення", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");
    await decide("manager1@example.test", id, "approved");

    // Бачать і працівник, і відповідальний менеджер посади.
    for (const who of ["teacher1@example.test", "manager1@example.test"]) {
      const rows = await leave.asUser<{ decision: string; decided_by: string; decided_at: string }>(
        leave.users[who],
        "select decision, decided_by, decided_at from public.leave_decisions where record_id = $1",
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].decision).toBe("approved");
      expect(rows[0].decided_by).toBe(leave.users["manager1@example.test"]);
      expect(rows[0].decided_at).toBeTruthy();
    }
  });

  it("менеджер чужої посади історії не бачить", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");
    await decide("manager1@example.test", id, "approved");

    const seen = await leave.asUser(
      leave.users["manager2@example.test"],
      "select id from public.leave_decisions where record_id = $1",
      [id],
    );

    expect(seen).toHaveLength(0);
  });

  it("рішення не редагують і не видаляють", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");
    await decide("manager1@example.test", id, "approved");

    // Колонкових grant update/delete немає ні в кого з authenticated.
    await expect(
      leave.asUser(
        leave.users["manager1@example.test"],
        "update public.leave_decisions set decision = 'rejected' where record_id = $1",
        [id],
      ),
    ).rejects.toThrow();
    await expect(
      leave.asUser(
        leave.users["manager1@example.test"],
        "delete from public.leave_decisions where record_id = $1",
        [id],
      ),
    ).rejects.toThrow();

    expect(await decisionCount()).toBe(1);
  });
});

/**
 * Друга лінія: ті самі відмови прямим запитом, повз public.decide_leave_record.
 *
 * Тести вище йдуть через функцію, і вона сама перевіряє право — тож вони
 * лишилися б зеленими навіть без політики. Тут атака «правильна»: статус і
 * рядок історії одним запитом, тож відкладений тригер історії вдоволений і
 * єдине, що лишається на заваді, — політики й private.decides_record.
 * Заміни хелпер на `select true` — і ці тести впадуть.
 */
describe("прямий запит повз функцію", () => {
  /**
   * Те, що зробив би нападник: статус і рядок історії одним запитом, щоб
   * відкладений constraint trigger не завадив. Лишаються самі політики.
   */
  const decideDirectly = (actor: string, recordId: string, status = "approved") =>
    leave.asUser(
      leave.users[actor],
      `with upd as (
         update public.leave_records set status = $3 where id = $1 returning id
       )
       insert into public.leave_decisions (record_id, decided_by, decision)
       select id, $2, $3 from upd`,
      [recordId, leave.users[actor], status],
    );

  it("AC-DECIDE-09: працівник не змінить статус власного запису напряму", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await expect(decideDirectly("teacher1@example.test", id)).rejects.toThrow();

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);
  });

  it("AC-DECIDE-18: менеджер не змінить статус власного запису напряму", async () => {
    const id = await seedRecord("manager1@example.test", "manager1@example.test:main");

    await expect(decideDirectly("manager1@example.test", id)).rejects.toThrow();

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);
  });

  it("AC-DECIDE-08: менеджер чужої посади напряму статус не змінить", async () => {
    // manager2 веде лише додаткову посаду teacher1; це запис основної. Політика
    // select йому цей рядок не віддає, тож update не зачіпає нічого: помилки
    // немає, змін теж — саме це й вимагає AC.
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await decideDirectly("manager2@example.test", id);

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);
  });

  it("AC-DECIDE-07: вирішений запис другий менеджер напряму не перепише", async () => {
    const id = await seedRecord("teacher2@example.test", "teacher2@example.test:main");
    await decide("manager1@example.test", id, "approved");

    // using політики вимагає status = 'awaiting' — рядок просто не зачепить,
    // тож і вставляти історію нема до чого.
    await decideDirectly("manager2@example.test", id, "rejected");

    expect(await statusOf(id)).toBe("approved");
    expect(await decisionCount()).toBe(1);
  });

  it("AC-DECIDE-15: зміна статусу без рядка історії не проходить", async () => {
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    // Адміністратор має право вирішувати (AC-DECIDE-10), але слід в історії
    // обов'язковий: відкладений constraint trigger валить транзакцію на commit.
    await expect(
      leave.asUser(
        leave.users["admin@example.test"],
        "update public.leave_records set status = 'approved' where id = $1",
        [id],
      ),
    ).rejects.toThrow();

    expect(await statusOf(id)).toBe("awaiting");
    expect(await decisionCount()).toBe(0);
  });

  it("AC-DECIDE-10: адміністратор тим самим запитом рішення зберігає", async () => {
    // Дзеркало до тестів вище: якби політика просто все блокувала, вони були б
    // зелені й без права. Тут той самий запит має пройти.
    const id = await seedRecord("teacher1@example.test", "teacher1@example.test:main");

    await decideDirectly("admin@example.test", id);

    expect(await statusOf(id)).toBe("approved");
    expect(await decisionCount()).toBe(1);
  });
});
