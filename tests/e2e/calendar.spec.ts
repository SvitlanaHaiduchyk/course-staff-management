// AC-CAL-14, AC-CAL-15 — шкільний календар: хто його бачить і що на порожньому році.
// Лише читання: безпечно на проді.
import { expect, test } from "@playwright/test";

import { attachRuntimeErrors, given, thenStep, when } from "./support/uat";

const EMPLOYEE = "teacher1@example.test";

test.afterEach(async ({ page }) => attachRuntimeErrors(page));

test.describe("календар для авторизованого", () => {
  test.use({ storageState: "playwright/.auth/teacher1.json" });

  test(
    "AC-CAL-15: рік без закриттів показує «No closed days in school year 2026–2027»",
    { tag: ["@uat"], annotation: { type: "ac", description: "AC-CAL-15" } },
    async ({ page }) => {
      await given("працівник teacher1@example.test — у порталі", async () => {
        await page.goto("/");
        await expect(page.getByTestId("user-email")).toHaveText(EMPLOYEE);
      });

      await when("відкриває шкільний календар за навчальний рік 2026–2027", async () => {
        await page.goto("/calendar?year=2026");
      });

      await thenStep(
        page,
        {
          // «Тоді» — дослівно з AC-CAL-15 (requirements/04-school-calendar.md).
          clause:
            'the employee sees the message "No closed days in school year 2026–2027".',
          visible: [
            "заголовок сторінки «Шкільний календар»",
            "повідомлення «No closed days in school year 2026–2027»",
          ],
          hidden: ["жодного рядка із закриттям: переліку назв і дат немає"],
        },
        async () => {
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await expect(
            page.getByText("No closed days in school year 2026–2027", { exact: true }),
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
          visible: ["сторінка входу з полями Email і Password"],
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
