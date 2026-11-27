import "server-only";

// Власні заняття (уроки, наради) — потрібні трьом сторінкам: «Мій розклад»
// малює їх смугами, шкільний календар показує у віконечку дня, а «Мої заняття»
// дає їх вести. Запит один і той самий, тож живе тут, а не в кожній сторінці.

import type { LessonRow } from "@/lib/leave/lessons";
import type { requirePageSession } from "@/lib/supabase/page-session";

type PageSupabase = Awaited<ReturnType<typeof requirePageSession>>["supabase"];

/**
 * Заняття за посадами, у сталому порядку.
 *
 * Фільтр за своїми посадами — не захист, а вибір: політика
 * `lessons_select_own_managed_or_admin` віддала б менеджерові ще й чужі
 * заняття, а всі три сторінки розповідають про себе. Беремо весь тиждень
 * одразу: рядків на посаду десятки, а не тисячі, і день із них вибирає
 * `lessonsOn` без зайвого запиту на кожну дату сітки року.
 */
export async function loadMyLessons(
  supabase: PageSupabase,
  positionIds: readonly string[],
): Promise<LessonRow[]> {
  if (positionIds.length === 0) return [];

  const { data } = await supabase
    .from("lessons")
    .select("id, position_id, weekday, starts_at, ends_at, subject, form")
    .in("position_id", [...positionIds])
    .order("weekday")
    .order("starts_at");

  return data ?? [];
}
