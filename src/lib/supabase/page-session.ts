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

/**
 * Те саме, плюс роль із `profiles`.
 *
 * Сторінки календаря питають про неї однаково: показати екран чи дослівну
 * відмову PM (`AC-CAL-12`, `AC-ASSIST-11`). Роль беремо з `profiles`, ніколи з
 * `user_metadata`, і саме тому вона тут, а не в кожній сторінці окремо.
 *
 * Останній рубіж — політики `school_closures_insert_admin` і
 * `school_closures_delete_admin`: прибрати можна лише обидва.
 */
export async function requireAdminPage() {
  const { supabase, claims } = await requirePageSession();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();

  return { supabase, isAdmin: profile?.role === "admin" };
}
