import { redirect } from "next/navigation";

import { BalanceTable, type BalanceRpcRow } from "@/components/balance-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessages } from "@/lib/i18n/server";
import { schoolYearOf } from "@/lib/leave/balance";
import { createClient } from "@/lib/supabase/server";

// Залишки іншого працівника — AC-BALANCE-12, AC-BALANCE-13, AC-BALANCE-20.
//
// Це публічний GET із чужим id у шляху, тож права перевіряє не сторінка, а
// функція `public.employee_balance`: вона віддає рядки лише власникові,
// відповідальному менеджеру будь-якої посади працівника й адміністратору.
// Порожній результат означає «балансів не показуємо», і сторінка каже саме це.
export default async function EmployeeBalancesPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const { lang, m } = await getMessages();
  const year = schoolYearOf(new Date().toISOString().slice(0, 10));

  const { data: rows } = await supabase.rpc("employee_balance", {
    p_employee_id: employeeId,
    p_school_year: year,
  });

  // RLS: профіль працівника видно лише тому, хто веде його посаду.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", employeeId)
    .maybeSingle();

  const allowed = (rows ?? []).length > 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">
        {(allowed ? (profile?.full_name ?? profile?.email) : null) ?? m("balances.employee")}
      </h1>

      {allowed ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-lg font-medium">
              {m("balances.schoolYear")} {year}–{year + 1}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceTable rows={rows as BalanceRpcRow[]} lang={lang} />
          </CardContent>
        </Card>
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            {m("balances.forbidden")}
          </AlertDescription>
        </Alert>
      )}
    </main>
  );
}
