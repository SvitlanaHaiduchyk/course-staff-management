import type { SupabaseClient } from "@supabase/supabase-js";

import type { RequestPosition } from "@/components/request-form";
import type { MyRecord } from "@/components/records-table";
import type { CancellationRow } from "@/lib/leave/cancel";

import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export type MyRequestsData = {
  positions: RequestPosition[];
  records: MyRecord[];
  lastDecision: Map<string, { comment: string | null; decision: string }>;
  lastCancellation: Map<string, CancellationRow>;
};

/**
 * Дані сторінки «My requests» одним місцем.
 *
 * Чотири запити й дві мапи жили в самій сторінці, і разом із формою та
 * таблицею робили її найскладнішою функцією застосунку (ворота `fallow`).
 * Жодного фільтра «лише своє» тут немає свідомо: чужого не віддають політики
 * RLS (`AC-LEAVE-14`, `AC-DECIDE-03`, `AC-CANCEL-01`).
 */
export async function loadMyRequests(supabase: Client, employeeId: string): Promise<MyRequestsData> {
  // AC-LEAVE-02, AC-LEAVE-03: власні посади, main перед additional.
  const { data: positions } = await supabase
    .from("positions")
    .select("id, kind, job_title, divisions(name), schedule_blocks(weekday, starts_at, ends_at)")
    .eq("employee_id", employeeId)
    .order("kind", { ascending: false });

  const { data: records } = await supabase
    .from("leave_records")
    .select(
      "id, on_date, starts_at, ends_at, status, days_on_type, days_unpaid, positions(job_title), leave_requests(leave_type, comment)",
    )
    .order("on_date", { ascending: false });

  // AC-DECIDE-03, AC-DECIDE-05: працівник бачить коментар ОСТАННЬОГО рішення.
  const { data: decisions } = await supabase
    .from("leave_decisions")
    .select("record_id, comment, decision, decided_at")
    .order("decided_at", { ascending: false });

  // AC-CANCEL-01, AC-CANCEL-03, AC-CANCEL-08: позначка запиту, причина відмови
  // менеджера або його примітка — теж остання за часом.
  const { data: cancellations } = await supabase
    .from("leave_cancellations")
    .select("record_id, reason, decision, comment, requested_at")
    .order("requested_at", { ascending: false });

  return {
    positions: (positions ?? []) as RequestPosition[],
    records: (records ?? []) as MyRecord[],
    lastDecision: firstByRecord(decisions ?? [], (d) => ({
      comment: d.comment,
      decision: d.decision,
    })),
    lastCancellation: firstByRecord(cancellations ?? [], (c) => ({
      reason: c.reason,
      decision: c.decision === "confirmed" || c.decision === "declined" ? c.decision : null,
      comment: c.comment,
    })),
  };
}

/** Перший рядок на запис із уже відсортованого списку — тобто найсвіжіший. */
function firstByRecord<Row extends { record_id: string }, Value>(
  rows: readonly Row[],
  pick: (row: Row) => Value,
): Map<string, Value> {
  const byRecord = new Map<string, Value>();
  for (const row of rows) {
    if (!byRecord.has(row.record_id)) byRecord.set(row.record_id, pick(row));
  }
  return byRecord;
}
