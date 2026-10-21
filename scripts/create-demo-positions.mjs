#!/usr/bin/env node
// npm run positions:demo — створює синтетичні відділи, посади з розкладом і відповідальних
// менеджерів із supabase/demo-positions.json через секретний ключ. Запускати ПІСЛЯ
// npm run users:demo: посади посилаються на профілі за email.
//
// Ідемпотентно: повторний запуск нічого не дублює — посада шукається за парою
// (працівник, тип), розклад і менеджери перезаписуються.
//
// Чому скрипт, а не сид: сид у хмарі виконується лише один раз (db push --include-seed),
// а посади посилаються на auth.users, яких на момент сиду ще немає.
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

const file = path.join(process.cwd(), "supabase", "demo-positions.json");
const plan = JSON.parse(readFileSync(file, "utf8"));

for (const p of plan.positions) {
  for (const email of [p.employee, ...(p.managers ?? [])]) {
    if (!/^[^@\s]+@example\.test$/i.test(email ?? "")) {
      console.error(`Лише синтетичні адреси *@example.test: "${email}" у supabase/demo-positions.json.`);
      process.exit(1);
    }
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

// ── Відділи ─────────────────────────────────────────────────────────────────
const divisionIds = new Map();
for (const name of plan.divisions) {
  try {
    const { data: existing, error: readError } = await supabase
      .from("divisions")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (readError) throw readError;

    let id = existing?.id;
    if (!id) {
      const { data, error } = await supabase
        .from("divisions")
        .insert({ name })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
    }
    divisionIds.set(name, id);
    console.log(`✔ відділ ${name} — ${existing ? "уже є" : "створено"}`);
  } catch (e) {
    failed++;
    console.error(`✖ відділ ${name}: ${e.message ?? e}`);
  }
}

// ── Посади, розклад і менеджери ─────────────────────────────────────────────
for (const p of plan.positions) {
  try {
    const employeeId = await profileIdByEmail(p.employee);
    const divisionId = divisionIds.get(p.division);
    if (!divisionId) throw new Error(`немає відділу "${p.division}"`);

    const { data: existing, error: readError } = await supabase
      .from("positions")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("kind", p.kind)
      .maybeSingle();
    if (readError) throw readError;

    let positionId = existing?.id;
    if (positionId) {
      const { error } = await supabase
        .from("positions")
        .update({ division_id: divisionId, job_title: p.job_title })
        .eq("id", positionId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("positions")
        .insert({
          employee_id: employeeId,
          division_id: divisionId,
          kind: p.kind,
          job_title: p.job_title,
        })
        .select("id")
        .single();
      if (error) throw error;
      positionId = data.id;
    }

    // Розклад перезаписуємо цілком: так повторний запуск дає рівно те, що у файлі.
    const { error: clearBlocks } = await supabase
      .from("schedule_blocks")
      .delete()
      .eq("position_id", positionId);
    if (clearBlocks) throw clearBlocks;

    if (p.schedule?.length) {
      const { error } = await supabase.from("schedule_blocks").insert(
        p.schedule.map((b) => ({
          position_id: positionId,
          weekday: b.weekday,
          starts_at: b.starts_at,
          ends_at: b.ends_at,
        })),
      );
      if (error) throw error;
    }

    const { error: clearManagers } = await supabase
      .from("position_managers")
      .delete()
      .eq("position_id", positionId);
    if (clearManagers) throw clearManagers;

    for (const managerEmail of p.managers ?? []) {
      const managerId = await profileIdByEmail(managerEmail);
      const { error } = await supabase
        .from("position_managers")
        .insert({ position_id: positionId, manager_id: managerId });
      if (error) throw error;
    }

    console.log(
      `✔ ${p.employee} — ${p.division} / ${p.job_title} (${p.kind}), блоків ${p.schedule?.length ?? 0}, менеджерів ${p.managers?.length ?? 0}`,
    );
  } catch (e) {
    failed++;
    console.error(`✖ ${p.employee} / ${p.job_title}: ${e.message ?? e}`);
  }
}

if (failed) {
  console.error(
    `\nПомилок: ${failed}. Перевірте, що міграції застосовано (job db-deploy у CI), користувачів створено (npm run users:demo) і ключ — секретний (sb_secret_…).`,
  );
  process.exit(1);
}
console.log(`\nГотово: відділів ${plan.divisions.length}, посад ${plan.positions.length}.`);
