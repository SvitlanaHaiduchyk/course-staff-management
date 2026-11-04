import Link from "next/link";
import { redirect } from "next/navigation";

import { BalanceTable, type BalanceRpcRow } from "@/components/balance-table";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessages } from "@/lib/i18n/server";
import { schoolYearOf } from "@/lib/leave/balance";
import { createClient } from "@/lib/supabase/server";

// Власні залишки працівника — вимога requirements/03-leave-balance.md,
// основний сценарій, крок 1. Сторінка читає cookies, тож рендериться динамічно.
export default async function BalancesPage() {
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { lang, m } = await getMessages();
  const year = schoolYearOf(new Date().toISOString().slice(0, 10));

  // Функція віддає числа лише тому, хто має право їх бачити; тут це власник.
  const { data: rows } = await supabase.rpc("employee_balance", {
    p_employee_id: claims.sub,
    p_school_year: year,
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{m("nav.balances")}</h1>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg font-medium">
            {m("balances.schoolYear")} {year}–{year + 1}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BalanceTable rows={(rows ?? []) as BalanceRpcRow[]} lang={lang} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
          {m("nav.requests")}
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          {m("nav.home")}
        </Link>
      </div>
    </main>
  );
}
