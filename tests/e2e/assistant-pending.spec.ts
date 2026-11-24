// AC-ASSIST-08 — стан очікування: поки помічник не відповів, попросити вдруге не можна.
//
// Чому e2e, а не модульний тест: стан дає `useFormStatus`, тобто він існує лише
// в браузері, поки форма подається. Перевірити його в Node означало б додати до
// репозиторію засоби для тестів DOM заради одного AC — саме тому рядок матриці
// довго стояв «відкладено».
//
// Моделі цей тест НЕ торкається і в базу не пише: відповідь серверної дії
// затримується перехопленням запиту, і стан очікування тримається рівно стільки,
// скільки потрібно перевіркам. Тому специфікація без тегу `@writes` — вона
// безпечна в CI і не витрачає денний ліміт OpenRouter.
import { expect, test } from "@playwright/test";

import { given, thenStep, when } from "./support/uat";

/** Дослівний текст PM з AC-ASSIST-08 — англійською в обох мовах інтерфейсу. */
const PREPARING = "Preparing suggestions…";
const ASK = "Запропонувати закриття";

const CALENDAR_TEXT = "Winter break 28.12–08.01";

test.use({ storageState: "playwright/.auth/admin.json" });

test.describe("помічник календаря: стан очікування", () => {
  test(
    "AC-ASSIST-08: поки помічник не відповів, кнопка написана «Preparing suggestions…» і недоступна",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-ASSIST-08" } },
    async ({ page }) => {
      // Скільки разів сторінка попросила пропозиції. Якби кнопка лишалася
      // доступною, друге натискання додало б сюди ще один запит.
      let asked = 0;
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      await page.route("**/calendar/assistant", async (route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        asked += 1;
        // Тримаємо відповідь: саме так виглядає помічник, який ще думає.
        await held;
        await route.abort();
      });

      await given("адміністратор відкрив помічника календаря", async () => {
        await page.goto("/calendar/assistant");
        await expect(page.getByRole("button", { name: ASK })).toBeEnabled();
      });

      await when("просить пропозиції, і помічник ще не відповів", async () => {
        await page.locator('textarea[name="text"]').fill(CALENDAR_TEXT);
        await page.getByRole("button", { name: ASK }).click();
        await expect(page.getByRole("button", { name: PREPARING })).toBeVisible();
      });

      await thenStep(
        page,
        {
          // «Тоді» — дослівно з AC-ASSIST-08 (requirements/05-calendar-assistant.md).
          clause: `адміністратор бачить «${PREPARING}» і не може попросити пропозиції вдруге, доки помічник не відповість`,
          visible: [`кнопка, написана «${PREPARING}»`],
          hidden: [
            "кнопка недоступна (disabled, aria-busy)",
            "друге прохання до помічника не пішло",
          ],
        },
        async () => {
          const button = page.getByRole("button", { name: PREPARING });
          await expect(button).toBeVisible();
          await expect(button).toBeDisabled();
          await expect(button).toHaveAttribute("aria-busy", "true");

          // Спроба попросити вдруге має НЕ вдатися: Playwright чекає, доки
          // елемент стане придатним до натискання, і здається за таймаутом.
          // `force: true` тут був би самообманом — він обходить саме ту
          // недоступність, яку ми перевіряємо.
          let clicked = true;
          await button.click({ timeout: 1000 }).catch(() => {
            clicked = false;
          });
          expect(clicked).toBe(false);

          // І головне: другий запит до помічника не пішов.
          await expect.poll(() => asked, { timeout: 2000 }).toBe(1);
        },
      );

      release();
    },
  );
});
