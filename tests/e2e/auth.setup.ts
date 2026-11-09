// Вхід кожної ролі один раз за прогін → playwright/.auth/<role>.json (у .gitignore: там живі cookie сесії).
// Тести ролей беруть стан через test.use({ storageState: "playwright/.auth/<role>.json" }).
// Запис тут вимкнено (playwright.config.ts: setup — video, trace і screenshot "off"): саме тут вводиться пароль.
//
// Змінні з паролями (лише назви; значення — у .env.local, ніколи в коді й ніколи в чаті):
//   DEMO_USER_PASSWORD      — спільний пароль акаунтів із supabase/demo-users.json (npm run users:demo);
//   UAT_PASSWORD_<РОЛЬ>     — необов'язково: окремий пароль для ролі, напр. UAT_PASSWORD_MANAGER1.
//
// Джерело гарнесу: materials/uat домашки WS8. ROLES — наші акаунти з supabase/demo-users.json.
import { expect, test as setup } from "@playwright/test";

import { signIn } from "./support/uat";

/**
 * Ролі, під якими ганяємо UAT. Беремо рівно тих, кого потребують наші три AC:
 *   teacher1  — працівник (AC-BALANCE-13: чужі залишки);
 *   manager1  — відповідальний менеджер основної посади teacher1 (AC-DECIDE-04);
 *   manager2  — веде лише ДОДАТКОВУ посаду teacher1, тож записів основної не бачить (AC-DECIDE-14);
 *   admin     — адміністратор: поки що лише для скрінів за ролями, далі — AC шкільного календаря
 *               (`AC-CAL-01`, `-09`, `-12`: змінювати календар може лише він).
 */
const ROLES = {
  teacher1: "teacher1@example.test",
  manager1: "manager1@example.test",
  manager2: "manager2@example.test",
  admin: "admin@example.test",
} as const;

for (const [role, email] of Object.entries(ROLES)) {
  setup(`вхід: ${role}`, async ({ page, baseURL }) => {
    const password =
      process.env[`UAT_PASSWORD_${role.toUpperCase()}`] ?? process.env.DEMO_USER_PASSWORD;
    expect(
      password,
      `немає пароля для ролі ${role}: задайте DEMO_USER_PASSWORD або UAT_PASSWORD_${role.toUpperCase()} у .env.local`,
    ).toBeTruthy();

    // Мову закріплюємо явно: інтерфейс має перемикач UKR/ENG, і без цього
    // рядка звіт залежав би від того, що випадково лежить у cookie браузера.
    // Українська — типова мова порталу; тексти з AC однакові в обох мовах.
    await page.context().addCookies([
      { name: "lang", value: "uk", url: baseURL! },
    ]);

    await signIn(page, email, password!);
    // Головна показує email того, хто увійшов (data-testid="user-email").
    await expect(page.getByTestId("user-email")).toHaveText(email);
    await page.context().storageState({ path: `playwright/.auth/${role}.json` });
  });
}
