"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkDecision, isDecision } from "@/lib/leave/decision";
import { createClient } from "@/lib/supabase/server";

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

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    redirect("/login");
  }

  const recordId = String(formData.get("recordId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;

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
  });

  if (error) {
    // Тексти приходять із функції дослівно, як їх задає PM.
    fail(error.message);
  }

  revalidatePath("/decisions");
  revalidatePath("/requests");
  back("notice=" + encodeURIComponent("Decision saved"));
}
