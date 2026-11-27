"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ONLY_MANAGER_CHANGES_LIST } from "@/lib/leave/substitutes";
import { reportDbError } from "@/lib/observability/report";
import { createClient } from "@/lib/supabase/server";

function back(params: string): never {
  redirect(`/substitutes?${params}`);
}

function fail(message: string): never {
  back("error=" + encodeURIComponent(message));
}

/**
 * Додати людину до списку замін працівника (AC-SUBST-01).
 *
 * Server Action — публічний POST, тож право перевіряє не сторінка, а політика
 * `substitutes_insert_manager_or_admin` і хелпер `private.manages_employee`:
 * працівник не поповнить навіть власного списку (AC-SUBST-12), а менеджер
 * чужих посад — чужого (AC-SUBST-13). `tests/db/substitutes.test.ts`.
 */
export async function addSubstitute(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    redirect("/login");
  }

  const employeeId = String(formData.get("employeeId") ?? "");
  const substituteId = String(formData.get("substituteId") ?? "");

  if (!employeeId || !substituteId) {
    fail("Choose an employee and a substitute");
  }

  const { error } = await supabase
    .from("substitutes")
    .insert({ employee_id: employeeId, substitute_id: substituteId, added_by: claims.sub });

  if (error) {
    reportDbError(error, "substitutes.insert");
    // Відмову політики показуємо текстом PM, а не сирим рядком Postgres.
    fail(error.code === "42501" ? ONLY_MANAGER_CHANGES_LIST : error.message);
  }

  revalidatePath("/substitutes");
  revalidatePath("/requests");
  back("notice=" + encodeURIComponent("Substitute added"));
}

/** Прибрати людину зі списку замін (припущення PM: наявні записи не змінюються). */
export async function removeSubstitute(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    redirect("/login");
  }

  const employeeId = String(formData.get("employeeId") ?? "");
  const substituteId = String(formData.get("substituteId") ?? "");

  const { error } = await supabase
    .from("substitutes")
    .delete()
    .eq("employee_id", employeeId)
    .eq("substitute_id", substituteId);

  if (error) {
    reportDbError(error, "substitutes.delete");
    fail(error.code === "42501" ? ONLY_MANAGER_CHANGES_LIST : error.message);
  }

  revalidatePath("/substitutes");
  revalidatePath("/requests");
  back("notice=" + encodeURIComponent("Substitute removed"));
}
