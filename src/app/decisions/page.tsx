import Link from "next/link";
import { redirect } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DECISIONS, NO_RECORDS_AWAITING, statusLabel } from "@/lib/leave/decision";
import { positionKindLabel } from "@/lib/leave/format";
import { createClient } from "@/lib/supabase/server";

import { DecisionForm } from "./decision-form";

const hhmm = (time: string) => time.slice(0, 5);

// Сторінка «Awaiting decision» менеджера й адміністратора — вимога
// requirements/02-leave-decision.md, основний сценарій.
//
// Межі списку задає політика select на leave_records, а не умова тут: навіть
// помилка в цьому запиті не відкриє чужих записів (AC-DECIDE-01).
// Сторінка читає cookies, тому рендериться динамічно.
export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  // Роль — із profiles, ніколи з user_metadata.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  const role = profile?.role;
  const canOpen = role === "manager" || role === "admin";

  if (!canOpen) {
    // Відмова на сторінці: жодного чужого запису тут не показано.
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold">Awaiting decision</h1>
        <Alert variant="destructive">
          <AlertDescription>
            Рішення по записах ухвалює відповідальний менеджер посади або адміністратор.
          </AlertDescription>
        </Alert>
        <Link href="/" className={buttonVariants({ variant: "outline" }) + " w-fit"}>
          На головну
        </Link>
      </main>
    );
  }

  // RLS: менеджер бачить лише записи своїх посад, адміністратор — усі.
  const { data: awaiting } = await supabase
    .from("leave_records")
    .select(
      `id, on_date, starts_at, ends_at, status, position_id,
       positions(kind, job_title, profiles(full_name, email)),
       leave_requests(leave_type, comment, employee_id)`,
    )
    .eq("status", "awaiting")
    .order("on_date");

  // AC-DECIDE-11, AC-DECIDE-15: власні рішення цієї людини — її «History».
  const { data: history } = await supabase
    .from("leave_decisions")
    .select(
      `id, decision, comment, decided_at,
       leave_records(on_date, starts_at, ends_at, positions(job_title, profiles(full_name)))`,
    )
    .eq("decided_by", claims.sub)
    .order("decided_at", { ascending: false });

  // AC-DECIDE-18: власні записи менеджера вирішує лише адміністратор, тож
  // кнопок на них не показуємо. Відмову з текстом PM дає дія й база.
  const decidable = (awaiting ?? []).filter(
    (r) => role === "admin" || r.leave_requests?.employee_id !== claims.sub,
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Awaiting decision</h1>

      {params.error ? (
        <Alert variant="destructive">
          <AlertDescription>{params.error}</AlertDescription>
        </Alert>
      ) : null}
      {params.notice ? (
        <Alert>
          <AlertDescription>{params.notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg font-medium">
            На розгляді
          </CardTitle>
        </CardHeader>
        <CardContent>
          {decidable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{NO_RECORDS_AWAITING}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Працівник</TableHead>
                  <TableHead>Посада</TableHead>
                  <TableHead>Дата й години</TableHead>
                  <TableHead>Тип і коментар</TableHead>
                  <TableHead className="text-right">Рішення</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decidable.map((record) => {
                  const position = record.positions;
                  const request = record.leave_requests;
                  const hours = `${hhmm(record.starts_at)}–${hhmm(record.ends_at)}`;
                  const summary = `${position?.profiles?.full_name ?? "—"}, ${record.on_date} ${hours}`;

                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div>{position?.profiles?.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {position?.profiles?.email ?? ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{position?.job_title ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {position ? positionKindLabel(position.kind) : ""}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <div>{record.on_date}</div>
                        <div className="text-xs text-muted-foreground">{hours}</div>
                      </TableCell>
                      <TableCell>
                        <div>{request?.leave_type ?? "—"}</div>
                        {/* AC-DECIDE-20: коментар працівника видно менеджеру. */}
                        {request?.comment ? (
                          <div className="text-xs text-muted-foreground">{request.comment}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {DECISIONS.map((decision) => (
                            <DecisionForm
                              key={decision}
                              recordId={record.id}
                              decision={decision}
                              summary={summary}
                            />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg font-medium">
            History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(history ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Рішень ще немає.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Коли</TableHead>
                  <TableHead>Працівник і запис</TableHead>
                  <TableHead>Рішення</TableHead>
                  <TableHead>Коментар</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history ?? []).map((row) => {
                  const record = row.leave_records;
                  return (
                    <TableRow key={row.id}>
                      {/* AC-DECIDE-15: дата й час рішення, хто вирішив, яке рішення. */}
                      <TableCell className="tabular-nums text-xs">
                        {new Date(row.decided_at).toLocaleString("uk-UA", {
                          timeZone: "Europe/Kyiv",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell>
                        <div>{record?.positions?.profiles?.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {record ? `${record.on_date} ${hhmm(record.starts_at)}–${hhmm(record.ends_at)}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.decision} />
                        <span className="sr-only">{statusLabel(row.decision)}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.comment ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Link href="/" className={buttonVariants({ variant: "outline" }) + " w-fit"}>
        На головну
      </Link>
    </main>
  );
}
