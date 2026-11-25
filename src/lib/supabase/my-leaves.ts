import "server-only";

// Власні записи відпусток за проміжок дат — потрібні двом сторінкам:
// «Мій розклад» бере тиждень, шкільний календар — навчальний рік.

import type { requirePageSession } from "@/lib/supabase/page-session";

type PageSupabase = Awaited<ReturnType<typeof requirePageSession>>["supabase"];

/** Статуси, які прибирають людину з розкладу. Відхилений чи скасований запис її не прибирає. */
export const ABSENT_STATUSES = ["awaiting", "approved", "returned"];

export type MyLeaveRow = {
  readonly id: string;
  readonly position_id: string;
  readonly on_date: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly status: string;
  readonly leave_type: string | null;
};

/**
 * Відпустки за проміжок — **лише власні**: фільтр за своїми посадами.
 *
 * Політика `leave_records_select_own_managed_or_admin` віддала б менеджеру ще
 * й чужі записи, а обидві сторінки, які це кличуть, розповідають про себе.
 */
export async function loadMyLeaves(
  supabase: PageSupabase,
  positionIds: readonly string[],
  from: string,
  to: string,
): Promise<MyLeaveRow[]> {
  if (positionIds.length === 0) return [];

  const { data } = await supabase
    .from("leave_records")
    .select("id, position_id, on_date, starts_at, ends_at, status, leave_requests(leave_type)")
    .in("position_id", [...positionIds])
    .in("status", ABSENT_STATUSES)
    .gte("on_date", from)
    .lte("on_date", to);

  return (data ?? []).map((r) => ({
    id: r.id,
    position_id: r.position_id,
    on_date: r.on_date,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    status: r.status,
    leave_type: r.leave_requests?.leave_type ?? null,
  }));
}
