"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type DateChoice,
  type LeaveType,
  type Position,
  buildRecords,
} from "@/lib/leave/build";
import {
  APPROVED_CANNOT_CHANGE,
  canCancel,
  checkHoursEdit,
} from "@/lib/leave/record-edit";
import { type ScheduleBlock, scheduleFor } from "@/lib/leave/schedule";
import { validateHours } from "@/lib/leave/validate";
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

/**
 * Зміна годин власного запису до рішення (AC-DECIDE-16) і повторне подання
 * повернутого (AC-DECIDE-06).
 *
 * Server Action — публічний POST-ендпойнт, тож перевірка тут, а не лише в тому,
 * які поля намальовано. Друга лінія — політика `leave_records_update_own_pending`
 * і функція `public.update_record_hours` у базі (`tests/db/record-edit.test.ts`).
 */
export async function changeRecordHours(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    redirect("/login");
  }

  const recordId = String(formData.get("recordId") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const resubmit = formData.get("resubmit") === "1";

  // RLS: працівник бачить лише власні записи та розклад власних посад.
  const { data: record } = await supabase
    .from("leave_records")
    .select("id, on_date, status, positions(schedule_blocks(weekday, starts_at, ends_at))")
    .eq("id", recordId)
    .maybeSingle();

  if (!record) {
    redirect("/requests?error=" + encodeURIComponent("Record not found"));
  }

  const allowed = checkHoursEdit(record.status);
  if (!allowed.ok) {
    redirect("/requests?error=" + encodeURIComponent(allowed.message));
  }

  // Межі розкладу — ті самі чисті функції, що й при поданні заявки.
  const blocks: ScheduleBlock[] = (record.positions?.schedule_blocks ?? []).map((b) => ({
    weekday: b.weekday,
    startsAt: b.starts_at.slice(0, 5),
    endsAt: b.ends_at.slice(0, 5),
  }));
  const dayBlocks = scheduleFor(blocks, record.on_date);
  const checked = validateHours(dayBlocks, { startsAt, endsAt });
  if (!checked.ok) {
    redirect("/requests?error=" + encodeURIComponent(checked.message));
  }

  // Перетин перевіряє база: лише вона бачить усі записи в один момент часу.
  const { error } = await supabase.rpc("update_record_hours", {
    p_record_id: recordId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_resubmit: resubmit,
  });

  if (error) {
    redirect("/requests?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/requests");
  revalidatePath("/decisions");
  redirect("/requests");
}

/**
 * Скасування власного запису до рішення (AC-DECIDE-13).
 *
 * Скасований запис повторно не подати (AC-DECIDE-17): політика
 * `leave_records_update_own_pending` лишає під update лише «awaiting» і «returned».
 */
export async function cancelRecord(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    redirect("/login");
  }

  const recordId = String(formData.get("recordId") ?? "");

  const { data: record } = await supabase
    .from("leave_records")
    .select("id, status")
    .eq("id", recordId)
    .maybeSingle();

  if (!record) {
    redirect("/requests?error=" + encodeURIComponent("Record not found"));
  }

  if (!canCancel(record.status)) {
    redirect(
      "/requests?error=" +
        encodeURIComponent(
          record.status === "approved"
            ? APPROVED_CANNOT_CHANGE
            : "Only a record awaiting a decision can be cancelled",
        ),
    );
  }

  const { error } = await supabase
    .from("leave_records")
    .update({ status: "cancelled" })
    .eq("id", recordId);

  if (error) {
    redirect("/requests?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/requests");
  revalidatePath("/decisions");
  redirect("/requests");
}
