// AC-ASSIST-01, AC-ASSIST-02 — помічник календаря наживо: текст → пропозиції → збереження.
//
// @writes: специфікація звертається до моделі й зберігає закриття, тож прибирає
// їх за собою (afterAll). Без SUPABASE_SECRET_KEY прогін пропускається — так
// само, як інші @writes-специфікації гарнесу. У CI вона не біжить: там немає ні
// секретного ключа, ні ключа моделі.
//
// Кожен тест — один запит до моделі з денного ліміту OpenRouter (20/хв, 50/добу
// на акаунт). Тому їх рівно два, і обидва на найважливіших AC: що помічник
// пропонує і що нічого не зберігається без людини.
import { expect, test } from "@playwright/test";

import { adminClient, hasAdminKey } from "./support/admin";
import { given, thenStep, when } from "./support/uat";

test.use({ storageState: "playwright/.auth/admin.json" });

/** Текст із AC-ASSIST-01, дослівно. */
const CALENDAR_TEXT = "Winter break 28.12–08.01; Teachers' meeting 20.11 from 12:00";

const WINTER = { name: "Winter break", startsOn: "2026-12-28", endsOn: "2027-01-08" };
const MEETING = { name: "Teachers' meeting", startsOn: "2026-11-20", endsOn: "2026-11-20" };

// `attachRuntimeErrors` тут НЕ викликаємо, на відміну від решти специфікацій.
// Він опитує відповідь кожного запиту сторінки, а цей сценарій живе хвилини й
// робить їх десятки: прогін 2026-11-18 завис саме в цьому хуку й завалив тест,
// який по суті пройшов. Помилки сторінки тут ловлять траса й відео Playwright.

if (!hasAdminKey()) {
  console.warn(
    "AC-ASSIST-01, AC-ASSIST-02 пропущено: немає SUPABASE_SECRET_KEY у .env.local — специфікація зберігає закриття й прибирає їх.",
  );
} else {
  test.describe("помічник календаря наживо", () => {
    // Безкоштовна модель відповідає десятки секунд, а типовий бюджет тесту —
    // 60 с на весь тест. Прогін 2026-11-18 упав саме на цьому: очікування
    // відповіді не вміщалося у власний ліміт тесту.
    test.setTimeout(180_000);

    // Прибираємо саме свої рядки: назва + обидві дати, а не лише назва.
    test.afterAll(async () => {
      const db = adminClient();
      for (const c of [WINTER, MEETING]) {
        await db
          .from("school_closures")
          .delete()
          .eq("name", c.name)
          .eq("starts_on", c.startsOn)
          .eq("ends_on", c.endsOn);
      }
    });

    test(
      "AC-ASSIST-01: помічник пропонує два закриття, і календар лишається без змін",
      { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-ASSIST-01" } },
      async ({ page }) => {
        await given("шкільний календар не має жодного закриття", async () => {
          await page.goto("/calendar?year=2026");
          await expect(page.getByText("No closed days in school year 2026–2027")).toBeVisible();
        });

        await when("адміністратор просить помічника про пропозиції для тексту календаря", async () => {
          await page.goto("/calendar/assistant");
          await page.locator('textarea[name="text"]').fill(CALENDAR_TEXT);
          await page.getByRole("button", { name: "Запропонувати закриття" }).click();
          await expect(page.getByRole("button", { name: "Зберегти закриття" })).toBeVisible({ timeout: 120_000 });
        });

        // Кадр «Тоді» знімається з видимої частини сторінки, а дві пропозиції в
        // неї не вміщаються: рецензент 2026-11-18 побачив лише першу й чесно
        // сказав «не можу судити». Зменшуємо масштаб, щоб у кадрі було все, що
        // обіцяє «Тоді».
        await page.evaluate(() => {
          document.documentElement.style.zoom = "0.67";
        });

        await thenStep(
          page,
          {
            // «Тоді» — дослівно з AC-ASSIST-01 (requirements/05-calendar-assistant.md).
            clause:
              'the administrator sees 2 suggested closures — "Winter break" whole days 2026-12-28 – 2027-01-08 and "Teachers\' meeting" early dismissal on 2026-11-20 from 12:00 — and the school calendar still has no closures.',
            visible: [
              "дві запропоновані позиції з назвами «Winter break» і «Teachers' meeting»",
              "дати 2026-12-28 – 2027-01-08 у «Winter break»",
              "дата 2026-11-20 і час 12:00 у «Teachers' meeting»",
              "підпис про те, що пропозиції ще не збережено",
            ],
            hidden: ["шкільний календар і далі без закриттів: перевіряємо окремою сторінкою"],
          },
          async () => {
            const names = page.locator('input[name="name"]');
            await expect(names).toHaveCount(2);
            // Порядок пропозицій — за датами, тож «Teachers' meeting» (20.11) іде першим.
            // Перевіряємо поокремо: `toHaveValues` — для `<select multiple>`, а не для набору полів.
            await expect(names.nth(0)).toHaveValue(MEETING.name);
            await expect(names.nth(1)).toHaveValue(WINTER.name);

            const winter = page.locator("li").filter({ has: page.locator('input[value="Winter break"]') });
            await expect(winter.locator('input[name="startsOn"]')).toHaveValue(WINTER.startsOn);
            await expect(winter.locator('input[name="endsOn"]')).toHaveValue(WINTER.endsOn);

            const meeting = page.locator("li").filter({ has: page.locator(`input[value="${MEETING.name}"]`) });
            await expect(meeting.locator('input[name="startsOn"]')).toHaveValue(MEETING.startsOn);
            await expect(meeting.locator('input[name="closesAt"]')).toHaveValue("12:00");
          },
        );

        // Нічого не збережено: окрема сторінка, бо цього не видно на кадрі помічника.
        const other = await page.context().newPage();
        await other.goto("/calendar?year=2026");
        await expect(other.getByText("No closed days in school year 2026–2027")).toBeVisible();
        await other.close();
      },
    );

    test(
      "AC-ASSIST-02: збережені без змін пропозиції потрапляють у шкільний календар",
      { tag: ["@uat", "@writes"], annotation: { type: "ac", description: "AC-ASSIST-02" } },
      async ({ page }) => {
        await given("адміністратор має дві запропоновані позиції з тексту календаря", async () => {
          await page.goto("/calendar/assistant");
          await page.locator('textarea[name="text"]').fill(CALENDAR_TEXT);
          await page.getByRole("button", { name: "Запропонувати закриття" }).click();
          await expect(page.locator('input[name="name"]')).toHaveCount(2, { timeout: 120_000 });
        });

        await when("адміністратор зберігає їх без змін", async () => {
          await page.getByRole("button", { name: "Зберегти закриття" }).click();
          await expect(page.getByRole("button", { name: "Зберегти закриття" })).toHaveCount(0);
        });

        await page.goto("/calendar?year=2026");

        await thenStep(
          page,
          {
            // «Тоді» — дослівно з AC-ASSIST-02.
            clause:
              'the school calendar shows "Teachers\' meeting" on 2026-11-20 from 12:00 and "Winter break" 2026-12-28 – 2027-01-08.',
            visible: [
              "рядок «Teachers' meeting» з датою 2026-11-20 і часом 12:00",
              "рядок «Winter break» з датами 2026-12-28 – 2027-01-08",
            ],
          },
          async () => {
            await expect(page.getByText(MEETING.name)).toBeVisible();
            await expect(page.getByText(WINTER.name)).toBeVisible();
            await expect(page.getByText("12:00")).toBeVisible();
            await expect(page.getByText("No closed days in school year 2026–2027")).toHaveCount(0);
          },
        );
      },
    );
  });
}
