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
import {
  CANCELLATION_REQUESTED,
  CANCEL_NEEDS_REASON,
  checkReason,
} from "@/lib/leave/cancel";
import {
  type DateChoice,
  type Position,
  buildRecords,
  relationshipFor,
} from "@/lib/leave/build";
import { type Closure } from "@/lib/leave/closure";
import {
  APPROVED_CANNOT_CHANGE,
  canCancel,
  checkHoursEdit,
} from "@/lib/leave/record-edit";
import { type ScheduleBlock, minutesInsideBlocks, scheduleFor } from "@/lib/leave/schedule";
import { validateHours } from "@/lib/leave/validate";
import { createClient } from "@/lib/supabase/server";
import { reportDbError } from "@/lib/observability/report";

/**
 * Подання заявки на відпустку.
 *
 * Доменні правила (межі розкладу, побудова записів, перевірка перетину) лежать
 * у `src/lib/leave/` і перевіряються модульними тестами. Ця дія лише читає
 * розклад, викликає їх і передає готові записи у функцію Postgres, яка
 * створює заявку атомарно (AC-LEAVE-16).
 */
/**
 * Закриття шкільного календаря, що перетинаються з обраними датами.
 *
 * Бачить їх кожен авторизований користувач (`AC-CAL-02`), тож окремих прав тут
 * не потрібно. Беремо лише потрібний відрізок: решта навчального року до
 * заявки стосунку не має.
 *
 * Межі порівнюємо як рядки: формат `YYYY-MM-DD` упорядкований лексикографічно
 * так само, як хронологічно.
 */
async function readClosures(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dates: readonly string[],
): Promise<Closure[]> {
  if (dates.length === 0) return [];

  const sorted = [...dates].sort();
  const { data } = await supabase
    .from("school_closures")
    .select("name, starts_on, ends_on, closes_at")
    .lte("starts_on", sorted[sorted.length - 1])
    .gte("ends_on", sorted[0]);

  return (data ?? []).map((row) => ({
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    closesAt: row.closes_at === null ? null : row.closes_at.slice(0, 5),
  }));
}

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
  // Спорідненість стосується лише Family celebration — так каже і підпис поля,
  // і обмеження бази `leave_requests_relationship_check`.
  const relationship = relationshipFor(leaveType, String(formData.get("relationship") ?? ""));
  const comment = String(formData.get("comment") ?? "").trim() || null;
  // AC-SUBST-02, AC-SUBST-03: заміна необов'язкова. Вибір один на заявку —
  // PM дозволяє різні заміни на різні записи, але не вимагає цього.
  const substituteId = String(formData.get("substitute") ?? "").trim() || null;

  // RLS: працівник бачить лише власні посади та їхні розклади.
  const { data: rows, error: readError } = await supabase
    .from("positions")
    .select("id, schedule_blocks(weekday, starts_at, ends_at)")
    .in("id", positionIds.length > 0 ? positionIds : ["00000000-0000-0000-0000-000000000000"]);

  if (readError) {
    reportDbError(readError, "positions.read");
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

  // Закриття шкільного календаря бачить кожен авторизований користувач
  // (AC-CAL-02), тож окремих прав тут не потрібно. Беремо лише ті, що
  // припадають на обрані дати: решта року до заявки стосунку не має.
  const closures = await readClosures(supabase, dates);

  const built = buildRecords(
    { leaveType, relationship, comment, dates: dateChoices },
    positions,
    closures,
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
      // Зайнятість заміни (AC-SUBST-05, AC-SUBST-06) і її наявність у списку
      // (AC-SUBST-04) перевіряє сама функція: сторінка лише пропонує вибір.
      substitute_id: substituteId,
    })),
  });

  if (error) {
    reportDbError(error, "submit_leave_request");
    // Текст перетину приходить із функції дослівно, як його задає PM (AC-LEAVE-13).
    redirect("/requests?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/requests");
  revalidatePath("/balances");

  const notice = await submitNotices(supabase, claims.sub, leaveType, built);
  redirect(notice ? "/requests?notice=" + encodeURIComponent(notice) : "/requests");
}

/**
 * Повідомлення після успішного подання — одним рядком через «; ».
 *
 * Жодне з них заявку не зупиняє, тому всі йдуть як `notice`, а не `error`
 * (DESIGN.md, розділ 6).
 */
async function submitNotices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  leaveType: string,
  built: { skipped: readonly { date: string; message: string }[]; records: readonly DraftRecordLike[] },
): Promise<string> {
  const notices: string[] = [];

  // AC-LEAVE-21: дати без робочих годин лише відпали — повідомлення на кожну.
  for (const s of built.skipped) {
    notices.push(`${s.date}: ${s.message}`);
  }

  // AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17: ОДНЕ попередження на всю
  // заявку, за її сумарною часткою й залишком на момент подання.
  const warning = await overBalanceNotice(supabase, employeeId, leaveType, built.records);
  if (warning) notices.push(warning);

  return notices.join("; ");
}

/** Запис заявки так, як його повертає `buildRecords`. */
type DraftRecordLike = {
  positionId: string;
  date: string;
  startsAt: string;
  endsAt: string;
};

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
    reportDbError(error, "update_record_hours");
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
    reportDbError(error, "leave_records.cancel");
    redirect("/requests?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/requests");
  revalidatePath("/decisions");
  redirect("/requests");
}

/**
 * Запит на скасування ПОГОДЖЕНОГО запису (AC-CANCEL-01, AC-CANCEL-05,
 * AC-CANCEL-06, AC-CANCEL-10).
 *
 * Відрізняється від `cancelRecord` вище: там працівник сам скасовує запис,
 * який ще не погоджено (AC-DECIDE-13). Тут рішення за менеджером, тож дія лише
 * створює запит, а статус запису не чіпає — запис і далі рахується погодженим
 * (припущення PM).
 *
 * Server Action — публічний POST: усі перевірки тримає функція бази
 * `public.request_record_cancellation` і політики (`tests/db/cancel.test.ts`),
 * а тут лише порожня причина, щоб не ходити в базу даремно.
 */
export async function requestCancellation(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    redirect("/login");
  }

  const recordId = String(formData.get("recordId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const checked = checkReason(reason, CANCEL_NEEDS_REASON);
  if (!checked.ok) {
    redirect("/requests?error=" + encodeURIComponent(checked.message));
  }

  const { error } = await supabase.rpc("request_record_cancellation", {
    p_record_id: recordId,
    p_reason: reason.trim(),
  });

  if (error) {
    reportDbError(error, "request_record_cancellation");
    // Тексти приходять із функції дослівно, як їх задає PM.
    redirect("/requests?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/requests");
  revalidatePath("/decisions");
  redirect("/requests?notice=" + encodeURIComponent(CANCELLATION_REQUESTED));
}
