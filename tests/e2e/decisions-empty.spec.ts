// AC-DECIDE-14 — стан інтерфейсу: порожній список «Awaiting decision».
// Лише читання: безпечно на проді.
import { expect, test } from "@playwright/test";

import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

test.use({ storageState: "playwright/.auth/manager2.json" });

const MESSAGE = "No records awaiting decision";
const MANAGER = "manager2@example.test";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test(
  "AC-DECIDE-14: менеджер без записів на розгляді бачить «No records awaiting decision»",
  { tag: ["@uat"], annotation: { type: "ac", description: "AC-DECIDE-14" } },
  async ({ page }) => {
    await given("менеджер manager2@example.test — у порталі, записів на розгляді в нього немає", async () => {
      await page.goto("/");
      await expect(page.getByTestId("user-email")).toHaveText(MANAGER);
    });

    await when("відкриває список «Awaiting decision»", async () => {
      await page.goto("/decisions");
    });

    await thenStep(
      page,
      {
        // «Тоді» — дослівно з AC-DECIDE-14 (requirements/02-leave-decision.md).
        clause: 'the manager sees the message "No records awaiting decision".',
        visible: [
          "заголовок сторінки «Awaiting decision»",
          "повідомлення «No records awaiting decision»",
        ],
        hidden: [
          "жодного рядка із записом на розгляді: таблиці з працівником, посадою й годинами немає",
          "жодної кнопки рішення (Approve, Reject, Return for revision)",
        ],
      },
      async () => {
        await expect(page.getByRole("heading", { level: 1, name: "Awaiting decision" })).toBeVisible();
        await expect(page.getByText(MESSAGE, { exact: true })).toBeVisible();
        // «Що не змінилося»: рішень ухвалити нема над чим.
        await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Return for revision" })).toHaveCount(0);
      },
    );
  },
);
