// Негативний контроль: специфікація з НАВМИСНО хибною перевіркою «Тоді».
// Доводить, що гарнес справді червоніє й агент не ставить PASS наосліп.
// Запускається лише в npm run uat:nc (проєкт negative-controls, grep @negative-control).
//
// Формат — як у materials/uat/examples/negative-controls.spec.ts: ім'я починається з NC-…,
// анотація `ac` називає СПРАВЖНІЙ критерій, а «Тоді» (clause) теж правильне —
// хибне лише твердження в коді. Так ми перевіряємо саме ланцюг «перевірка → кадр → агент»,
// а не вміння агента читати вигадані AC.
import { expect, test } from "@playwright/test";

import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

test.use({ storageState: "playwright/.auth/manager2.json" });

const CLAUSE = "бачить повідомлення «No records awaiting decision», і жодного запису в списку немає";
/** Текст, якого на сторінці немає: правильний — «No records awaiting decision». */
const WRONG_MESSAGE = "Awaiting decision: 3 records";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test(
  "NC-1 (AC-DECIDE-14, навмисно хибне очікування в тесті: інший текст порожнього стану)",
  {
    tag: ["@negative-control"],
    annotation: [
      { type: "ac", description: "AC-DECIDE-14" },
      { type: "case", description: "NC-1" },
    ],
  },
  async ({ page }) => {
    await given("менеджер manager2@example.test — у порталі", async () => {
      await page.goto("/");
    });

    await when("відкриває список «Awaiting decision»", async () => {
      await page.goto("/decisions");
    });

    await thenStep(
      page,
      { clause: CLAUSE, visible: ["повідомлення «No records awaiting decision»"] },
      async () => {
        await expect(page.getByText(WRONG_MESSAGE, { exact: true })).toBeVisible({ timeout: 5_000 });
      },
    );
  },
);
