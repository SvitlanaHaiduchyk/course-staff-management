#!/usr/bin/env node
// npm run substitutes:demo — заповнює синтетичні списки можливих замін із
// supabase/demo-substitutes.json через секретний ключ. Запускати ПІСЛЯ
// npm run users:demo і npm run positions:demo: список посилається на профілі,
// а права на нього перевіряються за посадами.
//
// Навіщо взагалі: список замін веде менеджер у порталі (/substitutes), тож на
// свіжій базі він порожній, і форма заявки показує «Your manager has not added
// substitutes for you yet» (AC-SUBST-11). Для демонстрації й UAT це не те, що
// треба показувати першим.
//
// Ідемпотентно: список кожного працівника перезаписується цілком, тож
// повторний запуск дає рівно те, що у файлі, і нічого не дублює.
//
// Записує від імені секретного ключа (service_role), тобто повз політики
// substitutes_insert_manager_or_admin — як і решта скриптів демо-даних. Саме
// тому `added_by` ставимо реального менеджера цього працівника, а не «когось»:
// у базі має лишитися те саме, що лишив би портал.
//
// Потрібні змінні (читає .env.local через `node --env-file`):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
// Скрипт ніколи не друкує значення ключів.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { requireSupabaseEnv, requireSyntheticEmail } from "./lib/demo-env.mjs";

const [url, secretKey] = requireSupabaseEnv();

const file = path.join(process.cwd(), "supabase", "demo-substitutes.json");
const plan = JSON.parse(readFileSync(file, "utf8"));

for (const entry of plan.lists) {
  requireSyntheticEmail(entry.employee, "supabase/demo-substitutes.json");
  for (const email of entry.substitutes) {
    requireSyntheticEmail(email, "supabase/demo-substitutes.json");
  }
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** id профілю за адресою; кешуємо, бо ті самі люди трапляються в кількох списках. */
const profiles = new Map();

async function profileId(email) {
  if (profiles.has(email)) return profiles.get(email);

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`немає профілю ${email} — спершу npm run users:demo`);

  profiles.set(email, data.id);
  return data.id;
}

/**
 * Відповідальний менеджер будь-якої з посад працівника — він і є тим, хто в
 * порталі веде цей список. Якщо менеджера немає, беремо адміністратора:
 * вести список може і він (AC-SUBST-01, припущення PM).
 */
async function addedBy(employeeId) {
  const { data: positions, error } = await supabase
    .from("positions")
    .select("id")
    .eq("employee_id", employeeId);
  if (error) throw error;
  if (!positions?.length) throw new Error("немає посад — спершу npm run positions:demo");

  const { data: managers, error: managerError } = await supabase
    .from("position_managers")
    .select("manager_id")
    .in(
      "position_id",
      positions.map((p) => p.id),
    )
    .limit(1);
  if (managerError) throw managerError;
  if (managers?.length) return managers[0].manager_id;

  const { data: admin, error: adminError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (adminError) throw adminError;
  if (!admin) throw new Error("немає ні менеджера посади, ні адміністратора");
  return admin.id;
}

let failed = 0;
let total = 0;

for (const entry of plan.lists) {
  try {
    const employeeId = await profileId(entry.employee);
    const author = await addedBy(employeeId);

    // Перезаписуємо цілком — так повторний запуск дає рівно те, що у файлі.
    const { error: clear } = await supabase
      .from("substitutes")
      .delete()
      .eq("employee_id", employeeId);
    if (clear) throw clear;

    const rows = [];
    for (const email of entry.substitutes) {
      rows.push({
        employee_id: employeeId,
        substitute_id: await profileId(email),
        added_by: author,
      });
    }

    if (rows.length) {
      const { error } = await supabase.from("substitutes").insert(rows);
      if (error) throw error;
    }

    total += rows.length;
    console.log(`✔ ${entry.employee} — замін ${rows.length}`);
  } catch (e) {
    failed++;
    console.error(`✖ ${entry.employee}: ${e.message ?? e}`);
  }
}

if (failed) {
  console.error(
    `\nПомилок: ${failed}. Перевірте, що міграцію substitutes застосовано (job db-deploy у CI), користувачів і посади створено (npm run users:demo, npm run positions:demo) і ключ — секретний (sb_secret_…).`,
  );
  process.exit(1);
}
console.log(`\nГотово: списків ${plan.lists.length}, замін ${total}.`);
