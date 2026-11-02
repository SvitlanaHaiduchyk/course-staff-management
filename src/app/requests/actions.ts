"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type PositionSchedule,
  isLeaveType,
  overBalanceWarning,
  schoolYearOf,
  sharesForDate,
  sumShares,
  workingMinutesOn,
} from "@/lib/leave/balance";
import { type DateChoice, type Position, buildRecords } from "@/lib/leave/build";
import {
  APPROVED_CANNOT_CHANGE,
  canCancel,
  checkHoursEdit,
} from "@/lib/leave/record-edit";
import { type ScheduleBlock, minutesInsideBlocks, scheduleFor } from "@/lib/leave/schedule";
import { validateHours } from "@/lib/leave/validate";
import { createClient } from "@/lib/supabase/server";

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
  const claims = claimsData?.claims;
  if (!claims) {
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
  revalidatePath("/balances");

  const notices: string[] = [];

  // AC-LEAVE-21: дати без робочих годин лише відпали — повідомлення на кожну.
  for (const s of built.skipped) {
    notices.push(`${s.date}: ${s.message}`);
  }

  // AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17: ОДНЕ попередження на всю
  // заявку, за її сумарною часткою й залишком на момент подання. Заявку воно
  // не зупиняє — тому показуємо як notice, а не error.
  const warning = await overBalanceNotice(supabase, claims.sub, leaveType, built.records);
  if (warning) notices.push(warning);

  const notice = notices.join("; ");
  redirect(notice ? "/requests?notice=" + encodeURIComponent(notice) : "/requests");
}

/**
 * Попередження про перевищення залишку — або `null`, якщо заявка в межах.
 *
 * Знаменник частки дня — усі робочі хвилини працівника на дату за розкладами
 * **всіх** його посад, тож позиції читаємо повністю, а не лише включені в
 * заявку (AC-BALANCE-06).
 *
 * Межа: заявку через межу навчальних років (AC-BALANCE-22) порівнюємо із
 * залишком року найранішої дати. PM вимагає одне попередження на заявку й не
 * описує випадку, коли роки різні.
 */
async function overBalanceNotice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  leaveType: string,
  records: readonly { positionId: string; date: string; startsAt: string; endsAt: string }[],
): Promise<string | null> {
  if (records.length === 0) return null;

  // Типи без ліміту не перевищуються ніколи.
  if (leaveType !== "sick" && leaveType !== "personal") return null;

  // RLS: працівник бачить усі власні посади та їхні розклади.
  const { data: rows } = await supabase
    .from("positions")
    .select("id, schedule_blocks(weekday, starts_at, ends_at)")
    .eq("employee_id", employeeId);

  const all: PositionSchedule[] = (rows ?? []).map((row) => ({
    positionId: row.id,
    blocks: (row.schedule_blocks ?? []).map(
      (b): ScheduleBlock => ({
        weekday: b.weekday,
        startsAt: b.starts_at.slice(0, 5),
        endsAt: b.ends_at.slice(0, 5),
      }),
    ),
  }));

  const byDate = new Map<string, number[]>();
  for (const record of records) {
    const position = all.find((p) => p.positionId === record.positionId);
    const blocks = position ? scheduleFor(position.blocks, record.date) : [];
    const minutes = minutesInsideBlocks(blocks, {
      startsAt: record.startsAt,
      endsAt: record.endsAt,
    });
    byDate.set(record.date, [...(byDate.get(record.date) ?? []), minutes]);
  }

  let requested = 0;
  for (const [date, minutes] of byDate) {
    requested += sumShares(sharesForDate(minutes, workingMinutesOn(all, date)));
  }

  const earliest = [...byDate.keys()].sort()[0];
  const { data: balance } = await supabase.rpc("employee_balance", {
    p_employee_id: employeeId,
    p_school_year: schoolYearOf(earliest),
  });

  const row = (balance ?? []).find((b) => b.leave_type === leaveType);
  const remaining = Math.round((18 + Number(row?.carried_over ?? 0) - Number(row?.used ?? 0)) * 100);

  return requested > remaining
    ? overBalanceWarning(leaveType, Math.max(remaining, 0), requested)
    : null;
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
