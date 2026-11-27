import "server-only";

// Усі посади школи разом із власником — для сторінки занять адміністратора.
//
// Окремо від `loadMyPositions`: та відповідає на питання «які посади в МЕНЕ»
// і фільтрує за `employee_id`. Тут питання інше — «які посади є взагалі», і
// відповідь на нього RLS дає лише адміністраторові
// (`positions_select_own_managed_or_admin`). Менеджер побачить тут посади,
// якими опікується, але сторінка його й не пустить: право на запис — лише в
// адміністратора.

import type { requirePageSession } from "@/lib/supabase/page-session";

type PageSupabase = Awaited<ReturnType<typeof requirePageSession>>["supabase"];

export type OwnedPosition = {
  readonly id: string;
  readonly job_title: string;
  readonly divisions: { readonly name: string } | null;
  /** Ім'я власника посади, якщо воно є; інакше його адреса. */
  readonly owner: string | null;
};

/**
 * Посади з назвою підрозділу й власником, упорядковані за назвою посади.
 *
 * Двома запитами, а не вбудованим `profiles(...)`: `positions` має один
 * зовнішній ключ на `profiles`, але читати людей окремо простіше й передбачніше,
 * ніж покладатися на автоматичну назву зв'язку в типах.
 */
export async function loadAllPositions(supabase: PageSupabase): Promise<OwnedPosition[]> {
  const { data: positions } = await supabase
    .from("positions")
    .select("id, employee_id, job_title, divisions(name)")
    .order("job_title");

  const rows = positions ?? [];
  if (rows.length === 0) return [];

  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [...new Set(rows.map((row) => row.employee_id))]);

  const owners = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? null]));

  return rows.map((row) => ({
    id: row.id,
    job_title: row.job_title,
    divisions: row.divisions,
    owner: owners.get(row.employee_id) ?? null,
  }));
}
