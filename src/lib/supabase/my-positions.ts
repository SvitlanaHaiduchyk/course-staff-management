import "server-only";

// Власні посади з розкладом — потрібні двом сторінкам: «Personal information»
// (`/`) показує їх у картці профілю, «Мій розклад» (`/schedule`) малює з них
// тижневу сітку. Доки запит жив у обох файлах, `fallow` справедливо називав це
// дублюванням.

import type { requirePageSession } from "@/lib/supabase/page-session";

type PageSupabase = Awaited<ReturnType<typeof requirePageSession>>["supabase"];

/**
 * Посади людини разом із блоками розкладу, головна перед додатковою.
 *
 * RLS: працівник бачить лише власні посади та їхні розклади, тож фільтр за
 * `employee_id` — це не захист, а вибір потрібного рядка.
 */
export async function loadMyPositions(supabase: PageSupabase, employeeId: string) {
  const { data } = await supabase
    .from("positions")
    .select("id, kind, job_title, divisions(name), schedule_blocks(weekday, starts_at, ends_at)")
    .eq("employee_id", employeeId)
    .order("kind", { ascending: false }); // main перед additional

  return data ?? [];
}
