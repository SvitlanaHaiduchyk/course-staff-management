#!/usr/bin/env node
// D0.5: тестові акаунти для перевіряльника — `accounts.zip` (ZIP, AES-256) у корені `main`.
//
// Скрипт складає `accounts.txt` із `supabase/demo-users.json` і пароля демо-акаунтів,
// а тоді кличе 7-Zip, щоб той СПИТАВ пароль курсу інтерактивно.
//
// Жодного пароля скрипт не друкує й нікуди не записує, крім самого `accounts.txt`
// (він у `.gitignore`). Пароль курсу скрипт не бачить узагалі: його 7-Zip читає з
// клавіатури, тож він не потрапляє ні в аргументи процесу, ні в історію оболонки.
//
// Запуск:
//   node --env-file=.env.local scripts/zip-accounts.mjs
// Потрібні: `DEMO_USER_PASSWORD` у `.env.local` і 7-Zip
// (`winget install -e --id 7zip.7zip`).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TXT = path.join(ROOT, "accounts.txt");
const ZIP = path.join(ROOT, "accounts.zip");

const SEVEN_ZIP = [
  "C:\\Program Files\\7-Zip\\7z.exe",
  "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  "7z",
];

/** Що саме перевіряльникові варто знати про кожен акаунт, окрім ролі. */
const NOTES = {
  "admin@example.test": "бачить усі записи й залишки",
  "manager1@example.test": "відповідальний менеджер ОСНОВНОЇ посади teacher1 — на ньому AC-DECIDE-04",
  "manager2@example.test":
    "веде лише ДОДАТКОВУ посаду teacher1, тож список рішень у нього порожній — AC-DECIDE-14",
  "teacher1@example.test": "працівник із двома посадами; на ньому AC-BALANCE-13",
  "teacher2@example.test": "другий працівник — потрібен, щоб перевірити чужі залишки",
};

function fail(message) {
  console.error(`zip-accounts: ${message}`);
  process.exit(1);
}

const password = process.env.DEMO_USER_PASSWORD;
if (!password) {
  fail(
    "немає DEMO_USER_PASSWORD. Запускайте як `node --env-file=.env.local scripts/zip-accounts.mjs`.",
  );
}

const users = JSON.parse(readFileSync(path.join(ROOT, "supabase", "demo-users.json"), "utf8"));
const lines = [
  "Тестові акаунти — портал відсутностей персоналу школи",
  "https://course-staff-management.vercel.app",
  "",
  "Пароль однаковий у всіх акаунтів. Усі адреси синтетичні (@example.test).",
  "",
];
for (const user of users) {
  lines.push(
    `${user.role.padEnd(8)} ${user.email.padEnd(24)} ${password}   ${user.full_name}`,
    `         ${NOTES[user.email] ?? ""}`,
    "",
  );
}
lines.push(
  "Три AC, які здано на приймання:",
  "  AC-DECIDE-14  manager2 → /decisions показує «No records awaiting decision»",
  "                (саме manager2: під manager1 список НЕ порожній)",
  "  AC-DECIDE-04  manager1 → /decisions → «Return for revision» без коментаря",
  "                → «Tell the employee what to fix», статус не змінюється",
  "  AC-BALANCE-13 teacher1 → /balances/<id іншого працівника> → чисел немає",
  "",
);

writeFileSync(TXT, lines.join("\n"), "utf8");
console.log(`zip-accounts: accounts.txt складено (${users.length} акаунтів), пароль не друкуємо.`);

/** Перший 7-Zip, який справді запускається: два типові шляхи, тоді PATH. */
function findSevenZip() {
  for (const candidate of SEVEN_ZIP) {
    if (candidate !== "7z" && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["i"], { stdio: "ignore" });
    if (!probe.error) return candidate;
  }
  return null;
}

const sevenZip = findSevenZip();
if (!sevenZip) {
  fail(
    "7-Zip не знайдено. Встановіть `winget install -e --id 7zip.7zip` і запустіть скрипт ще раз.\n" +
      "accounts.txt уже складено — архів можна зробити й руками:\n" +
      '  & "C:\\Program Files\\7-Zip\\7z.exe" a -tzip -mem=AES256 -p accounts.zip accounts.txt',
  );
}

console.log("zip-accounts: 7-Zip зараз спитає ПАРОЛЬ КУРСУ (його вводите ви, він ніде не зберігається).");
const result = spawnSync(
  sevenZip,
  ["a", "-tzip", "-mem=AES256", "-p", "-sdel", ZIP, TXT],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  fail(`7-Zip завершився з кодом ${result.status}. accounts.txt лишився на місці — перевірте й повторіть.`);
}

console.log("zip-accounts: accounts.zip готовий, accounts.txt видалено (-sdel). Перевірте архів перед комітом.");
