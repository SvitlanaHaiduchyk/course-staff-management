import { redirect } from "next/navigation";

import { createClient } from "./server";

/**
 * Клієнт Supabase і перевірені claims для СТОРІНКИ. Без сесії — на `/login`.
 *
 * `getClaims()` перевіряє підпис JWT; `getSession()` для авторизації на сервері
 * не використовуємо (AGENTS.md, розділ «База даних»). Тримати цей виклик в одному
 * місці безпечніше, ніж повторювати його на кожній сторінці: правило або діє
 * скрізь, або не діє ніде.
 *
 * Серверні дії цим не користуються свідомо: сторінка без сесії перенаправляє,
 * а дія має повернути помилку туди, звідки її викликали.
 */
export async function requirePageSession() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  return { supabase, claims };
}
