// Негативний контроль: специфікація з НАВМИСНО хибним очікуванням «Тоді».
// Доводить, що гарнес справді червоніє, а вердикт агента не ставить PASS наосліп.
// Запускається лише в npm run uat:nc (проєкт negative-controls, grep @negative-control).
import { expect, test } from "@playwright/test";

import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

test.use({ storageState: "playwright/.auth/manager2.json" });

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test(
  "NC-DECIDE-14: порожній список нібито показує «Awaiting decision: 3 records» — очікування навмисно хибне",
  { tag: ["@uat", "@negative-control"], annotation: { type: "ac", description: "NC-DECIDE-14" } },
  async ({ page }) => {
    await given("менеджер manager2@example.test — у порталі", async () => {
      await page.goto("/");
      await expect(page.getByTestId("user-email")).toHaveText("manager2@example.test");
    });

    await when("відкриває список «Awaiting decision»", async () => {
      await page.goto("/decisions");
    });

    await thenStep(
      page,
      {
        // Текст, якого на сторінці НЕМАЄ: правильна поведінка — «No records awaiting decision».
        clause: "бачить повідомлення «Awaiting decision: 3 records»",
        visible: ["повідомлення «Awaiting decision: 3 records»"],
      },
      async () => {
        await expect(page.getByText("Awaiting decision: 3 records", { exact: true })).toBeVisible();
      },
    );
  },
);
