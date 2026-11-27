"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CANCEL_NEEDS_NOTE,
  DECLINE_NEEDS_COMMENT,
  checkReason,
  isCancellationDecision,
} from "@/lib/leave/cancel";
import { checkDecision, isDecision } from "@/lib/leave/decision";
import { createClient } from "@/lib/supabase/server";
import { reportDbError } from "@/lib/observability/report";

// Явний тип `never` потрібен, щоб TypeScript знав: далі код не виконується.
function back(params: string): never {
  redirect(`/decisions?${params}`);
}

function fail(message: string): never {
  back("error=" + encodeURIComponent(message));
}

/**
 * Рішення менеджера чи адміністратора по одному запису.
 *
 * Server Action — публічний POST-ендпойнт: його викликають напряму, оминувши
 * сторінку й приховану кнопку. Тому перевірка ролі тут, а не лише в proxy чи
 * в тому, які кнопки намальовано. Друга лінія — політика
 * `leave_records_update_decision` і хелпер `private.decides_record` у базі:
 * навіть якби цю перевірку прибрали, чужий запис не зміниться
 * (`tests/db/decisions.test.ts`).
 */
export async function decideRecord(formData: FormData) {
  const supabase = await createClient();

  // getClaims() перевіряє підпис JWT на сервері. getSession() читає cookie, якими
  // керує клієнт, і для авторизації не годиться — Server Action це публічний POST.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    redirect("/login");
  }

  const recordId = String(formData.get("recordId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;
  // AC-BALANCE-16: поділ — свідомий вибір менеджера, а не мовчазна згода.
  const withSplit = formData.get("withSplit") === "1";

  if (!recordId) {
    fail("Record not found");
  }
  if (!isDecision(decision)) {
    fail("Unknown decision");
  }

  // Роль — з profiles, ніколи з user_metadata чи з токена.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  // RLS віддає запис лише власнику, відповідальному менеджеру посади й адміністратору.
  const { data: record } = await supabase
    .from("leave_records")
    .select("id, status, position_id, leave_requests(employee_id)")
    .eq("id", recordId)
    .maybeSingle();

  if (!record) {
    fail("Record not found");
  }

  const { data: manages } = await supabase
    .from("position_managers")
    .select("position_id")
    .eq("position_id", record.position_id)
    .eq("manager_id", claims.sub)
    .maybeSingle();

  const checked = checkDecision({
    viewer: {
      role: profile?.role,
      isOwner: record.leave_requests?.employee_id === claims.sub,
      managesPosition: Boolean(manages),
    },
    status: record.status,
    decision,
    comment,
  });

  if (!checked.ok) {
    fail(checked.message);
  }

  // Статус і рядок історії — однією транзакцією у функції бази (AC-DECIDE-15).
  const { error } = await supabase.rpc("decide_leave_record", {
    p_record_id: recordId,
    p_decision: decision,
    p_comment: comment,
    p_with_split: withSplit,
  });

  if (error) {
    reportDbError(error, "decide_leave_record");
    // Тексти приходять із функції дослівно, як їх задає PM.
    fail(error.message);
  }

  revalidatePath("/decisions");
  revalidatePath("/requests");
  revalidatePath("/balances");
  back("notice=" + encodeURIComponent("Decision saved"));
}

/**
 * Рішення менеджера по запиту на скасування (AC-CANCEL-02, AC-CANCEL-03,
 * AC-CANCEL-04, AC-CANCEL-07, AC-CANCEL-11).
 *
 * Статус запису й рядок рішення міняє одна функція бази: у supabase-js немає
 * транзакцій, а підтвердження — це два записи. Право вирішувати перевіряє той
 * самий `private.decides_record`, що й для звичайних рішень, тож власний запис
 * менеджера й тут вирішує лише адміністратор (AC-DECIDE-18).
 */
export async function decideCancellation(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    redirect("/login");
  }

  const recordId = String(formData.get("recordId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "");

  if (!recordId) {
    fail("Record not found");
  }
  if (!isCancellationDecision(decision)) {
    fail("Unknown decision");
  }

  // AC-CANCEL-04: без коментаря відхилення до бази не йде.
  if (decision === "declined") {
    const checked = checkReason(comment, DECLINE_NEEDS_COMMENT);
    if (!checked.ok) {
      fail(checked.message);
    }
  }

  const { error } = await supabase.rpc("decide_record_cancellation", {
    p_record_id: recordId,
    p_decision: decision,
    p_comment: comment.trim() || null,
  });

  if (error) {
    reportDbError(error, "decide_record_cancellation");
    fail(error.message);
  }

  revalidatePath("/decisions");
  revalidatePath("/requests");
  revalidatePath("/balances");
  revalidatePath("/calendar");
  back("notice=" + encodeURIComponent("Cancellation decided"));
}

/**
 * Скасування погодженого запису самим менеджером, із приміткою працівникові
 * (AC-CANCEL-08, AC-CANCEL-09).
 */
export async function cancelRecordWithNote(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    redirect("/login");
  }

  const recordId = String(formData.get("recordId") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!recordId) {
    fail("Record not found");
  }

  const checked = checkReason(note, CANCEL_NEEDS_NOTE);
  if (!checked.ok) {
    fail(checked.message);
  }

  const { error } = await supabase.rpc("cancel_record_with_note", {
    p_record_id: recordId,
    p_note: note.trim(),
  });

  if (error) {
    reportDbError(error, "cancel_record_with_note");
    fail(error.message);
  }

  revalidatePath("/decisions");
  revalidatePath("/requests");
  revalidatePath("/balances");
  revalidatePath("/calendar");
  back("notice=" + encodeURIComponent("Record cancelled"));
}
