// AC-CAL-14, AC-CAL-15 — шкільний календар: хто його бачить і що на порожньому році.
// Лише читання: безпечно на проді.
import { expect, test } from "@playwright/test";

import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const EMPLOYEE = "teacher1@example.test";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.describe("календар для авторизованого", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test(
    "AC-CAL-15: рік без закриттів показує «No closed days in school year …»",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-CAL-15" } },
    async ({ page }) => {
      await given("працівник teacher1@example.test — у порталі", async () => {
        await page.goto("/");
        await expect(page.getByTestId("user-email")).toHaveText(EMPLOYEE);
      });

      // Рік 2025–2026, а не 2026–2027: «Дано» цього AC — рік БЕЗ закриттів, а в
      // 2026–2027 живуть демо-закриття з прикладів PM (Winter break 2026-12-28,
      // Teachers' meeting 2026-11-20), на які спираються AC-CAL-01 і AC-CAL-02.
      // Раніше тест проходив лише тому, що база випадково була порожня — тобто
      // «Дано» тримався на стані бази, а не на діях тесту.
      // Дослівний текст PM для 2026–2027 перевіряє модульний тест
      // (`tests/leave-calendar.test.ts`, `noClosuresMessage(2026)`); тут
      // перевіряємо поведінку сторінки на році, який порожній за побудовою.
      await when("відкриває шкільний календар за навчальний рік 2025–2026", async () => {
        await page.goto("/calendar?year=2025");
      });

      await thenStep(
        page,
        {
          // «Тоді» — дослівно з AC-CAL-15 (requirements/04-school-calendar.md).
          clause:
            'the employee sees the message "No closed days in school year 2025–2026".',
          visible: [
            "заголовок сторінки «Шкільний календар»",
            "повідомлення «No closed days in school year 2025–2026»",
          ],
          hidden: ["жодного рядка із закриттям: переліку назв і дат немає"],
        },
        async () => {
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await expect(
            page.getByText("No closed days in school year 2025–2026", { exact: true }),
          ).toBeVisible();
          await expect(page.getByTestId("calendar-list")).toHaveCount(0);
        },
      );
    },
  );

  test(
    "AC-CAL-02: працівник бачить пункт «Шкільний календар» у шапці",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-CAL-02" } },
    async ({ page }) => {
      await given("працівник teacher1@example.test — у порталі", async () => {
        await page.goto("/");
        await expect(page.getByTestId("user-email")).toHaveText(EMPLOYEE);
      });

      await when("дивиться на головну навігацію", async () => {
        await page.goto("/");
      });

      await thenStep(
        page,
        {
          clause: "every signed-in user can see the school calendar.",
          visible: ["пункт навігації, що веде на /calendar"],
          hidden: ["посилання на зміну календаря: воно лише для адміністратора"],
        },
        async () => {
          await expect(page.locator('nav a[href="/calendar"]').first()).toBeVisible();
          // Кнопки зміни календаря працівник не бачить навіть на /calendar.
          await page.goto("/calendar");
          await expect(page.locator('a[href="/calendar/manage"]')).toHaveCount(0);
        },
      );
    },
  );
});

test.describe("календар для неавторизованого", () => {
  // Без storageState: саме в цьому суть AC-CAL-14.
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "AC-CAL-14: відвідувач без входу бачить сторінку входу й жодної назви закриття",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-CAL-14" } },
    async ({ page }) => {
      await given("ніхто не увійшов", async () => {
        await page.context().clearCookies();
      });

      await when("відвідувач відкриває шкільний календар за прямим посиланням", async () => {
        await page.goto("/calendar");
      });

      await thenStep(
        page,
        {
          // «Тоді» — дослівно з AC-CAL-14.
          clause:
            "the visitor sees the sign-in page, and no closure names or dates are shown.",
          // Підписи — як на екрані, а не як у нашій голові: інтерфейс
          // українською, і поле підписане «Пароль». Рецензент цитує кадр
          // дослівно, тож «Password» тут давав FAIL на робочій сторінці.
          visible: ["сторінка входу із заголовком «Вхід», полями «Email» і «Пароль» та кнопкою «Увійти»"],
          hidden: [
            "жодної назви чи дати закриття",
            "переліку закриттів і порожнього стану календаря",
          ],
        },
        async () => {
          await expect(page).toHaveURL(/\/login/);
          await expect(page.getByLabel("Email")).toBeVisible();
          await expect(page.getByTestId("calendar-list")).toHaveCount(0);
          await expect(page.getByTestId("calendar-empty")).toHaveCount(0);
        },
      );
    },
  );
});

test.describe("зміна календаря — лише адміністратор", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test(
    "AC-CAL-12: працівник за прямим посиланням бачить відмову",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-CAL-12" } },
    async ({ page }) => {
      await given("працівник teacher1@example.test — у порталі й не є адміністратором", async () => {
        await page.goto("/");
        await expect(page.getByTestId("user-email")).toHaveText(EMPLOYEE);
      });

      await when("відкриває сторінку зміни шкільного календаря за прямим посиланням", async () => {
        await page.goto("/calendar/manage");
      });

      await thenStep(
        page,
        {
          // «Тоді» — дослівно з AC-CAL-12 (requirements/04-school-calendar.md).
          clause:
            'teacher1@example.test sees the message "Only an administrator can change the school calendar", and the school calendar is unchanged.',
          visible: ["повідомлення «Only an administrator can change the school calendar»"],
          hidden: [
            "форми додавання закриття: полів назви, дат і часу немає",
            "жодної кнопки «Прибрати» біля наявних закриттів",
          ],
        },
        async () => {
          await expect(
            page.getByText("Only an administrator can change the school calendar", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(page.locator('input[name="name"]')).toHaveCount(0);
          await expect(page.locator('input[name="startsOn"]')).toHaveCount(0);
          await expect(page.locator('input[name="closesAt"]')).toHaveCount(0);
          // Саме кнопки форм календаря, а не будь-який submit: перемикач мови
          // й вихід у шапці — теж submit, і вони на місці для кожного.
          await expect(page.getByRole("button", { name: "Додати закриття" })).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Прибрати" })).toHaveCount(0);
        },
      );
    },
  );
});

test.describe("адміністратор відкриває зміну календаря", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test(
    "AC-CAL-09: адміністратор бачить форму додавання й перелік закриттів",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-CAL-09" } },
    async ({ page }) => {
      await given("адміністратор admin@example.test — у порталі", async () => {
        await page.goto("/calendar");
      });

      await when("переходить до зміни шкільного календаря", async () => {
        await page.goto("/calendar/manage");
      });

      // Форма й перелік закриттів разом не вміщаються у видиму частину:
      // рецензент 2026-11-18 побачив лише форму й не зміг підтвердити перелік.
      await page.evaluate(() => {
        document.documentElement.style.zoom = "0.67";
      });

      await thenStep(
        page,
        {
          clause: "closures are created by the administrator in the portal.",
          visible: [
            "форма додавання: назва, вид закриття, дати й час закриття",
            "розділ наявних закриттів",
          ],
          hidden: ["повідомлення «Only an administrator can change the school calendar»"],
        },
        async () => {
          await expect(page.locator('input[name="name"]')).toBeVisible();
          await expect(page.locator('input[name="startsOn"]')).toBeVisible();
          await expect(page.locator('input[name="closesAt"]')).toBeVisible();
          await expect(page.locator('input[name="kind"]')).toHaveCount(2);
          await expect(
            page.getByText("Only an administrator can change the school calendar"),
          ).toHaveCount(0);
        },
      );
    },
  );
});
