#!/usr/bin/env node
// npm run lessons:demo — заповнює синтетичні заняття (уроки й наради) з
// supabase/demo-lessons.json через секретний ключ. Запускати ПІСЛЯ
// npm run positions:demo: заняття посилаються на посаду, яку знаходимо за
// парою (працівник, тип посади).
//
// Ідемпотентно: заняття посади перезаписуються цілком, тож повторний запуск
// дає рівно те, що у файлі, і нічого не дублює.
//
// Чому скрипт, а не сид: сид у хмарі виконується лише один раз, а посади
// посилаються на auth.users, яких на момент сиду ще немає — те саме міркування,
// що й у create-demo-positions.mjs.
//
// Заняття — шар показу: жодне обчислення балансу їх не читає
// (docs/decisions/0004-lessons-as-a-layer.md).
//
// Потрібні змінні (читає .env.local через `node --env-file`):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
// Скрипт ніколи не друкує значення ключів.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { requireSupabaseEnv, requireSyntheticEmail } from "./lib/demo-env.mjs";

const [url, secretKey] = requireSupabaseEnv();

const file = path.join(process.cwd(), "supabase", "demo-lessons.json");
const plan = JSON.parse(readFileSync(file, "utf8"));

for (const entry of plan.lessons) {
  requireSyntheticEmail(entry.employee, "supabase/demo-lessons.json");
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function positionId(email, kind) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error(`немає профілю ${email} — спершу npm run users:demo`);

  const { data, error } = await supabase
    .from("positions")
    .select("id")
    .eq("employee_id", profile.id)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`немає посади ${kind} — спершу npm run positions:demo`);
  return data.id;
}

let failed = 0;
let total = 0;

for (const entry of plan.lessons) {
  try {
    const id = await positionId(entry.employee, entry.kind);

    // Перезаписуємо цілком — так повторний запуск дає рівно те, що у файлі.
    const { error: clear } = await supabase.from("lessons").delete().eq("position_id", id);
    if (clear) throw clear;

    if (entry.week?.length) {
      const { error } = await supabase.from("lessons").insert(
        entry.week.map((lesson) => ({
          position_id: id,
          weekday: lesson.weekday,
          starts_at: lesson.starts_at,
          ends_at: lesson.ends_at,
          subject: lesson.subject,
          form: lesson.form ?? null,
        })),
      );
      if (error) throw error;
    }

    total += entry.week?.length ?? 0;
    console.log(`✔ ${entry.employee} (${entry.kind}) — занять ${entry.week?.length ?? 0}`);
  } catch (e) {
    failed++;
    console.error(`✖ ${entry.employee} (${entry.kind}): ${e.message ?? e}`);
  }
}

if (failed) {
  console.error(
    `\nПомилок: ${failed}. Перевірте, що міграцію lessons застосовано (job db-deploy у CI), посади створено (npm run positions:demo) і ключ — секретний (sb_secret_…).`,
  );
  process.exit(1);
}
console.log(`\nГотово: посад ${plan.lessons.length}, занять ${total}.`);
