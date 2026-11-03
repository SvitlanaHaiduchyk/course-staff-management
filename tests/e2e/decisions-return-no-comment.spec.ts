// AC-DECIDE-04 — стан інтерфейсу: помилка з дослівним текстом PM.
//
// @writes: специфікація створює ОДИН запис на розгляді й прибирає його за собою
// (afterAll). Без SUPABASE_SECRET_KEY прогін пропускається — так само, як інші
// @writes-специфікації гарнесу.
//
// Запис засіваємо секретним ключем, а не через форму подання: нам потрібен рівно
// один передбачуваний запис у менеджера manager1, і жодних побічних заявок на проді.
import { expect, test } from "@playwright/test";

import { adminClient, hasAdminKey } from "./support/admin";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

test.use({ storageState: "playwright/.auth/manager1.json" });

const MESSAGE = "Tell the employee what to fix";
const MANAGER = "manager1@example.test";
const EMPLOYEE = "teacher1@example.test";
/** Коментар-маркер: за ним знаходимо свій запис і прибираємо саме його. */
const MARKER = `uat-${process.env.UAT_RUN ?? "manual"}: AC-DECIDE-04`;

/** Понеділок далеко попереду: у teacher1 основна посада працює Пн–Пт, і чужих записів там немає. */
function futureMonday(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

let requestId: string | null = null;
let recordId: string | null = null;
const onDate = futureMonday();

// Обгортка замість test.skip — та сама ідіома, що й у cleanup.teardown.ts гарнесу:
// без SUPABASE_SECRET_KEY сіяти нічого, тож тест просто не реєструється.
if (!hasAdminKey()) {
  console.warn(
    "AC-DECIDE-04 пропущено: немає SUPABASE_SECRET_KEY у .env.local — специфікація засіває запис і прибирає його.",
  );
} else {
  test.beforeAll(async () => {
    const db = adminClient();

    const { data: employee } = await db
      .from("profiles")
      .select("id")
      .eq("email", EMPLOYEE)
      .maybeSingle();
    expect(
      employee?.id,
      `немає профілю ${EMPLOYEE} — спершу npm run users:demo на проді`,
    ).toBeTruthy();

    const { data: position } = await db
      .from("positions")
      .select("id")
      .eq("employee_id", employee!.id)
      .eq("kind", "main")
      .maybeSingle();
    expect(
      position?.id,
      `немає основної посади ${EMPLOYEE} — спершу npm run positions:demo на проді`,
    ).toBeTruthy();

    const { data: request, error } = await db
      .from("leave_requests")
      .insert({
        employee_id: employee!.id,
        leave_type: "sick",
        comment: MARKER,
      })
      .select("id")
      .single();
    expect(
      error,
      `не вдалося засіяти заявку: ${error?.message ?? ""}`,
    ).toBeNull();
    requestId = request!.id;

    const { data: record, error: recordError } = await db
      .from("leave_records")
      .insert({
        request_id: requestId,
        position_id: position!.id,
        on_date: onDate,
        starts_at: "08:30",
        ends_at: "15:30",
      })
      .select("id")
      .single();
    expect(
      recordError,
      `не вдалося засіяти запис: ${recordError?.message ?? ""}`,
    ).toBeNull();
    recordId = record!.id;
  });

  test.afterEach(async ({ page }) => attachRuntimeErrors(page));

  test.afterAll(async () => {
    if (!requestId) return;
    // Каскад прибирає й leave_records, і leave_decisions.
    await adminClient().from("leave_requests").delete().eq("id", requestId);
  });

  test(
    "AC-DECIDE-04: менеджер повертає запис без коментаря — статус не змінюється, видно «Tell the employee what to fix»",
    {
      tag: ["@uat", "@writes"],
      annotation: { type: "ac", description: "AC-DECIDE-04" },
    },
    async ({ page }) => {
      await given(
        `у менеджера ${MANAGER} є запис зі статусом «Awaiting decision»`,
        async () => {
          await page.goto("/decisions");
          await expect(
            page.getByRole("heading", { level: 1, name: "Awaiting decision" }),
          ).toBeVisible();
          await expect(page.getByText(onDate)).toBeVisible();
        },
      );

      await when(
        "він повертає запис на доопрацювання, лишивши коментар порожнім",
        async () => {
          await page
            .getByRole("button", { name: "Return for revision" })
            .first()
            .click();
          // Діалог підтвердження: коментар не заповнюємо.
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Return for revision" })
            .click();
        },
      );

      await thenStep(
        page,
        {
          clause:
            "статус запису не змінився — він досі «Awaiting decision», — і менеджер бачить повідомлення «Tell the employee what to fix»",
          visible: [
            "повідомлення «Tell the employee what to fix»",
            `запис на ${onDate} досі в списку «Awaiting decision»`,
          ],
          hidden: ["жодної позначки «Returned for revision» на цьому записі"],
        },
        async () => {
          await expect(page.getByText(MESSAGE, { exact: true })).toBeVisible();
          // «Що не змінилося» — і на сторінці, і в базі.
          await expect(page.getByText(onDate)).toBeVisible();
          await expect(page.getByText("Returned for revision")).toHaveCount(0);

          const { data } = await adminClient()
            .from("leave_records")
            .select("status")
            .eq("request_id", requestId!);
          expect(data?.map((r) => r.status)).toEqual(["awaiting"]);

          // Рішення не записано: жодного рядка історії по цьому запису.
          const { count } = await adminClient()
            .from("leave_decisions")
            .select("id", { count: "exact", head: true })
            .eq("record_id", recordId!);
          expect(count ?? 0).toBe(0);
        },
      );
    },
  );
}
