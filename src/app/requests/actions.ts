"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type DateChoice,
  type LeaveType,
  type Position,
  buildRecords,
} from "@/lib/leave/build";
import { type ScheduleBlock } from "@/lib/leave/schedule";
import { createClient } from "@/lib/supabase/server";

const LEAVE_TYPES: readonly LeaveType[] = ["sick", "personal", "unpaid", "family_celebration"];

function isLeaveType(value: string): value is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(value);
}

/**
 * Подання заявки на відпустку.
 *
 * Доменні правила (межі розкладу, побудова записів, перевірка перетину) лежать
 * у `src/lib/leave/` і перевіряються модульними тестами. Ця дія лише читає
 * розклад, викликає їх і передає готові записи у функцію Postgres, яка
 * створює заявку атомарно (AC-LEAVE-16).
 */
export async function submitLeaveRequest(formData: FormData) {
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    redirect("/login");
  }

  const leaveType = String(formData.get("leaveType") ?? "");
  if (!isLeaveType(leaveType)) {
    redirect("/requests?error=" + encodeURIComponent("Choose a leave type"));
  }

  const dates = formData.getAll("date").map(String).filter(Boolean);
  const positionIds = formData.getAll("position").map(String).filter(Boolean);
  const relationship = String(formData.get("relationship") ?? "").trim() || null;
  const comment = String(formData.get("comment") ?? "").trim() || null;

  // RLS: працівник бачить лише власні посади та їхні розклади.
  const { data: rows, error: readError } = await supabase
    .from("positions")
    .select("id, schedule_blocks(weekday, starts_at, ends_at)")
    .in("id", positionIds.length > 0 ? positionIds : ["00000000-0000-0000-0000-000000000000"]);

  if (readError) {
    redirect("/requests?error=" + encodeURIComponent(readError.message));
  }

  const positions: Position[] = (rows ?? []).map((row) => ({
    id: row.id,
    blocks: (row.schedule_blocks ?? []).map(
      (b): ScheduleBlock => ({
        weekday: b.weekday,
        startsAt: b.starts_at.slice(0, 5),
        endsAt: b.ends_at.slice(0, 5),
      }),
    ),
  }));

  const dateChoices: DateChoice[] = dates.map((date) => ({
    date,
    positions: positions.map((p) => ({ positionId: p.id, included: true, wholeDay: true })),
  }));

  const built = buildRecords(
    { leaveType, relationship, comment, dates: dateChoices },
    positions,
  );

  if (!built.ok) {
    redirect("/requests?error=" + encodeURIComponent(built.message));
  }

  const { error } = await supabase.rpc("submit_leave_request", {
    p_leave_type: leaveType,
    p_relationship: relationship,
    p_comment: comment,
    p_records: built.records.map((r) => ({
      position_id: r.positionId,
      on_date: r.date,
      starts_at: r.startsAt,
      ends_at: r.endsAt,
    })),
  });

  if (error) {
    // Текст перетину приходить із функції дослівно, як його задає PM (AC-LEAVE-13).
    redirect("/requests?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/requests");

  // AC-LEAVE-21: дати без робочих годин лише відпали — показуємо по повідомленню на кожну.
  const skipped = built.skipped.map((s) => `${s.date}: ${s.message}`).join("; ");
  redirect(skipped ? "/requests?notice=" + encodeURIComponent(skipped) : "/requests");
}
