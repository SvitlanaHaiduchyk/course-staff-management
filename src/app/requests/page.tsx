import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordsTable } from "@/components/records-table";
import { RequestForm } from "@/components/request-form";
import { getMessages } from "@/lib/i18n/server";
import { todayInKyiv } from "@/lib/leave/today";
import { loadMyRequests } from "@/lib/supabase/my-requests";
import { createClient } from "@/lib/supabase/server";



export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const { error, notice } = await searchParams;
  const { lang, m } = await getMessages();
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { positions, records, lastDecision, lastCancellation } = await loadMyRequests(
    supabase,
    claims.sub,
  );

  // Київська дата — та сама межа «сьогодні або пізніше», що й у базі (AC-CANCEL-05).
  const today = todayInKyiv();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">My requests</h1>

      {/* Помилка зупиняє заявку — Alert варіанта destructive. */}
      {error ? (
        <Alert variant="destructive" role="alert" data-testid="request-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/*
        Попередження НЕ зупиняє заявку (AC-LEAVE-21, AC-BALANCE-08), тож виглядає інакше
        за помилку: Alert варіанта default. Вимога PM — …spec#17.
      */}
      {notice ? (
        <Alert role="status" data-testid="request-notice">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg">{m("requests.new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestForm positions={positions} lang={lang} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg">{m("requests.mine")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RecordsTable
            records={records}
            lastDecision={lastDecision}
            lastCancellation={lastCancellation}
            today={today}
          />
        </CardContent>
      </Card>
    </main>
  );
}
