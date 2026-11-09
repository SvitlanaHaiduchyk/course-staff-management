// Скріни за ролями для docs/img/ — читає лише сторінки, нічого не записує в базу.
//
//   npx playwright test --project=setup   → стани входу playwright/.auth/<role>.json
//   npm run dev                           → застосунок на http://localhost:3000
//   npm run shots:roles                   → знімки в docs/img/
//
// Інша адреса — SHOT_BASE_URL (наприклад, прод-URL). Без npm-скрипта ворота fallow
// вважали б цей файл мертвим: скрипти з package.json fallow бачить сам.
import { chromium } from "@playwright/test";

const BASE = process.env.SHOT_BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2];
if (!OUT) throw new Error("перший аргумент — тека docs/img");

const SHOTS = [
  { role: "teacher1", path: "/", file: "ws6-employee-home.png" },
  { role: "teacher1", path: "/requests", file: "ws6-employee-requests.png" },
  { role: "teacher1", path: "/balances", file: "ws6-employee-balances.png" },
  { role: "manager1", path: "/decisions", file: "ws6-manager-decisions.png" },
  { role: "admin", path: "/", file: "ws6-admin-home.png" },
];

const browser = await chromium.launch();
for (const shot of SHOTS) {
  const context = await browser.newContext({
    storageState: `playwright/.auth/${shot.role}.json`,
    viewport: { width: 1280, height: 900 },
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  // Кнопка інструментів `next dev` — не частина порталу, у документації їй не місце.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: `${OUT}/${shot.file}`, fullPage: true });
  console.log(`${shot.file} ← ${shot.role} ${shot.path} (${page.url()})`);
  await context.close();
}
await browser.close();
