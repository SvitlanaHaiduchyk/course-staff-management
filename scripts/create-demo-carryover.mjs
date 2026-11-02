#!/usr/bin/env node
// npm run carryover:demo — вносить перенесені з попереднього навчального року дні
// з supabase/demo-carryover.json через секретний ключ. Запускати ПІСЛЯ
// npm run users:demo: рядки посилаються на профілі за email.
//
// Навіщо окремий скрипт: перенесення — єдина частина балансу, яка не виводиться
// з погоджених записів (AC-BALANCE-11, AC-BALANCE-21). У застосунку їх ніхто не
// створює: таблиця leave_carryover має grant select і нічого більше, тож
// записати в неї може лише service_role.
//
// Ідемпотентно: повторний запуск перезаписує рядок за ключем
// (працівник, тип, навчальний рік).
//
// Потрібні змінні (читає .env.local через `node --env-file`):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
// Скрипт ніколи не друкує значення ключів.
import { readFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SECRET_KEY", secretKey],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length) {
  console.error(`Не задано: ${missing.join(", ")}. Додайте їх у .env.local (див. .env.example).`);
  process.exit(1);
}

const LEAVE_TYPES = ["sick", "personal", "unpaid", "family_celebration"];

const file = path.join(process.cwd(), "supabase", "demo-carryover.json");
const plan = JSON.parse(readFileSync(file, "utf8"));

for (const row of plan.carryover) {
  if (!/^[^@\s]+@example\.test$/i.test(row.employee ?? "")) {
    console.error(`Лише синтетичні адреси *@example.test: "${row.employee}".`);
    process.exit(1);
  }
  if (!LEAVE_TYPES.includes(row.leave_type)) {
    console.error(`Невідомий тип відпустки "${row.leave_type}" у ${row.employee}.`);
    process.exit(1);
  }
  if (!(row.days >= 0)) {
    console.error(`Перенесені дні не можуть бути від'ємні: ${row.days} у ${row.employee}.`);
    process.exit(1);
  }
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function profileIdByEmail(email) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`немає профілю ${email} — спершу npm run users:demo`);
  return data.id;
}

let failed = 0;

for (const row of plan.carryover) {
  try {
    const employeeId = await profileIdByEmail(row.employee);
    const { error } = await supabase.from("leave_carryover").upsert(
      {
        employee_id: employeeId,
        leave_type: row.leave_type,
        school_year: row.school_year,
        days: row.days,
      },
      { onConflict: "employee_id,leave_type,school_year" },
    );
    if (error) throw error;
    console.log(
      `✔ ${row.employee} — ${row.leave_type}, ${row.school_year}–${row.school_year + 1}: ${row.days.toFixed(2)}`,
    );
  } catch (error) {
    failed += 1;
    console.error(`✖ ${row.employee} — ${row.leave_type}: ${error.message}`);
  }
}

if (failed > 0) {
  console.error(`\nНе внесено рядків: ${failed}.`);
  process.exit(1);
}
console.log(`\nГотово: ${plan.carryover.length} рядків перенесення.`);
