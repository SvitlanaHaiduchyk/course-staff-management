// AC-BALANCE-13 — відмова, яку видно в браузері: чужі залишки за прямим посиланням.
// Лише читання: безпечно на проді.
//
// Правило живе в базі (`private.may_see_balance`), і сторінка на нього спирається:
// порожній результат функції і означає «балансів не показуємо». Тому тест б'є саме
// за URL — так, як це зробив би той, хто вгадав чуже посилання.
import { expect, test, type Page } from "@playwright/test";

import { adminClient, hasAdminKey } from "./support/admin";
import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

test.use({ storageState: "playwright/.auth/teacher1.json" });

const TEACHER1 = "teacher1@example.test";
const OTHER = "teacher2@example.test";
const MESSAGE =
  "Залишки працівника бачить він сам, відповідальний менеджер будь-якої його посади й адміністратор.";

/** Усі адреси @example.test, які видно на сторінці. */
async function visibleEmails(page: Page): Promise<string[]> {
  const text = await page.locator("body").innerText();
  return [...new Set(text.match(/[\w.+-]+@example\.test/gi) ?? [])];
}

/**
 * id іншого працівника беремо секретним ключем — це інфраструктура тесту, а не те,
 * що перевіряємо: teacher1 чужого профілю не бачить (на тому й стоїть AC), тож
 * дізнатися id «зсередини» його сесії неможливо.
 */
let otherId: string | null = null;

test.beforeAll(async () => {
  expect(hasAdminKey(), "потрібен SUPABASE_SECRET_KEY у .env.local: треба id іншого працівника").toBe(
    true,
  );
  const { data } = await adminClient().from("profiles").select("id").eq("email", OTHER).maybeSingle();
  expect(data?.id, `немає профілю ${OTHER} — спершу npm run users:demo на проді`).toBeTruthy();
  otherId = data!.id;
});

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test(
  "AC-BALANCE-13: працівник відкриває чужі залишки за прямим посиланням — чисел не бачить",
  { tag: ["@uat"], annotation: { type: "ac", description: "AC-BALANCE-13" } },
  async ({ page }) => {
    await given(`працівник ${TEACHER1} — у порталі, і він не менеджер жодної посади ${OTHER}`, async () => {
      await page.goto("/");
      await expect(page.getByTestId("user-email")).toHaveText(TEACHER1);
    });

    await when("відкриває сторінку залишків іншого працівника за її адресою", async () => {
      await page.goto(`/balances/${otherId}`);
    });

    await thenStep(
      page,
      {
        // «Тоді» — дослівно з AC-BALANCE-13 (requirements/03-leave-balance.md).
        // Переказувати його українською не можна: PM звіряє звіт із вимогою слово в слово.
        clause: "the balances are not shown.",
        visible: [
          "заголовок «Залишки працівника»",
          "повідомлення «Залишки працівника бачить він сам, відповідальний менеджер будь-якої його посади й адміністратор.»",
        ],
        hidden: [
          "таблиці залишків: немає ні «Надано», ні «Використано», ні «Залишилось», ні жодного числа з комою",
          `жодної чужої адреси: ${OTHER} на сторінці немає`,
        ],
      },
      async () => {
        await expect(page.getByRole("heading", { level: 1, name: "Залишки працівника" })).toBeVisible();
        await expect(page.getByText(MESSAGE)).toBeVisible();
        // «Що не змінилося»: жодного числа чужого балансу.
        await expect(page.getByRole("table")).toHaveCount(0);
        await expect(page.getByText("Використано")).toHaveCount(0);
        await expect(page.getByText("Залишилось")).toHaveCount(0);
        expect(await visibleEmails(page)).not.toContain(OTHER);
      },
    );
  },
);
