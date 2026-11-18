// AC-ASSIST-11 — помічник календаря: хто його відкриває.
// Лише читання, без звернень до моделі: безпечно на проді й у CI.
import { expect, test } from "@playwright/test";

import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const EMPLOYEE = "teacher1@example.test";
const ONLY_ADMIN = "Only an administrator can change the school calendar";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.describe("помічник календаря для працівника", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test(
    "AC-ASSIST-11: працівник за прямим посиланням бачить відмову й жодного поля",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-ASSIST-11" } },
    async ({ page }) => {
      await given("працівник teacher1@example.test — у порталі, має лише роль працівника", async () => {
        await page.goto("/");
        await expect(page.getByTestId("user-email")).toHaveText(EMPLOYEE);
      });

      await when("відкриває помічника календаря за прямим посиланням", async () => {
        await page.goto("/calendar/assistant");
      });

      await thenStep(
        page,
        {
          // «Тоді» — дослівно з AC-ASSIST-11 (requirements/05-calendar-assistant.md).
          clause: `teacher1@example.test sees the message "${ONLY_ADMIN}", and no closures are suggested or saved.`,
          visible: [`повідомлення «${ONLY_ADMIN}»`],
          hidden: [
            "поле для тексту календаря",
            "кнопка, що просить пропозиції",
            "будь-яке запропоноване закриття",
          ],
        },
        async () => {
          await expect(page.getByText(ONLY_ADMIN)).toBeVisible();
          await expect(page.locator('textarea[name="text"]')).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Запропонувати закриття" })).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Зберегти закриття" })).toHaveCount(0);
        },
      );
    },
  );
});

// AC-ASSIST-01 тут більше немає: його доводить `assistant-live.spec.ts`, де
// помічника справді просять про пропозиції. Тест, що лише переконувався в
// наявності поля, займав той самий AC у звіті UAT і показував «пройшло» там,
// де головного — двох пропозицій із тексту — ніхто не перевіряв.
