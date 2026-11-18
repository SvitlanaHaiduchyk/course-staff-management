#!/usr/bin/env node
// npm run closures:demo — створює синтетичні закриття шкільного календаря з
// supabase/demo-closures.json через секретний ключ. Запускати ПІСЛЯ
// npm run users:demo: закриття посилається на профіль автора за email.
//
// Назви й дати — з прикладів PM у requirements/04-school-calendar.md, щоб
// локальний календар виглядав так само, як сценарії AC.
//
// Ідемпотентно: закриття шукається за назвою й датою початку, наявне не
// дублюється. Нічого не видаляє — прибирати закриття має людина на сторінці.
//
// Потрібні змінні (читає .env.local через `node --env-file`):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
// Скрипт ніколи не друкує значення ключів.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { requireSupabaseEnv, requireSyntheticEmail } from "./lib/demo-env.mjs";

const [url, secretKey] = requireSupabaseEnv();

const file = path.join(process.cwd(), "supabase", "demo-closures.json");
const plan = JSON.parse(readFileSync(file, "utf8"));

requireSyntheticEmail(plan.createdBy, "supabase/demo-closures.json");

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: author, error: authorError } = await supabase
  .from("profiles")
  .select("id")
  .eq("email", plan.createdBy)
  .maybeSingle();
if (authorError) throw authorError;
if (!author) {
  console.error(`Немає профілю ${plan.createdBy} — спершу npm run users:demo.`);
  process.exit(1);
}

let failed = 0;

for (const c of plan.closures) {
  const { data: existing, error: findError } = await supabase
    .from("school_closures")
    .select("id")
    .eq("name", c.name)
    .eq("starts_on", c.startsOn)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    console.log(`= ${c.name} ${c.startsOn} — уже є`);
    continue;
  }

  // Пишемо прямо в таблицю, а не через add_school_closure: секретний ключ
  // обходить RLS, а функція перевіряє права політикою insert. Перевірки
  // перетину все одно тримає обмеження school_closures_no_overlap.
  const { error } = await supabase.from("school_closures").insert({
    name: c.name,
    starts_on: c.startsOn,
    ends_on: c.endsOn,
    closes_at: c.closesAt ?? null,
    created_by: author.id,
  });

  if (error) {
    console.error(`✗ ${c.name} ${c.startsOn}: ${error.message}`);
    failed += 1;
    continue;
  }
  console.log(`+ ${c.name} ${c.startsOn}`);
}

if (failed) process.exit(1);
