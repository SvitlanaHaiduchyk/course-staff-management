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
import {
  dayShare,
  exceedsBalance,
  managerSplitWarning,
  schoolYearOf,
  suggestedSplit,
} from "@/lib/leave/balance";
import { DECISIONS, NO_RECORDS_AWAITING, statusLabel } from "@/lib/leave/decision";
import { positionKindKey } from "@/lib/i18n/dict";
import { getMessages } from "@/lib/i18n/server";
import { leaveTypeLabel } from "@/lib/leave/format";
import { minutesInsideBlocks, scheduleFor } from "@/lib/leave/schedule";
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
  const { lang, m } = await getMessages();
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
        <h1 className="text-2xl font-semibold">{m("decisions.awaiting")}</h1>
        <Alert variant="destructive">
          <AlertDescription>
            {m("decisions.forbidden")}
          </AlertDescription>
        </Alert>
        <Link href="/" className={buttonVariants({ variant: "outline" }) + " w-fit"}>
          {m("nav.home")}
        </Link>
      </main>
    );
  }

  // RLS: менеджер бачить лише записи своїх посад, адміністратор — усі.
  const { data: awaiting } = await supabase
    .from("leave_records")
    .select(
      `id, on_date, starts_at, ends_at, status, position_id,
       positions(kind, job_title, employee_id,
                 profiles!positions_employee_id_fkey(full_name, email),
                 schedule_blocks(weekday, starts_at, ends_at)),
       leave_requests(leave_type, comment, employee_id)`,
    )
    .eq("status", "awaiting")
    .order("on_date");

  // AC-DECIDE-11, AC-DECIDE-15: власні рішення цієї людини — її «History».
  const { data: history } = await supabase
    .from("leave_decisions")
    .select(
      `id, decision, comment, decided_at,
       leave_records(on_date, starts_at, ends_at,
                     positions(job_title, profiles!positions_employee_id_fkey(full_name)))`,
    )
    .eq("decided_by", claims.sub)
    .order("decided_at", { ascending: false });

  // AC-DECIDE-18: власні записи менеджера вирішує лише адміністратор, тож
  // кнопок на них не показуємо. Відмову з текстом PM дає дія й база.
  const decidable = (awaiting ?? []).filter(
    (r) => role === "admin" || r.leave_requests?.employee_id !== claims.sub,
  );

  // AC-BALANCE-09, AC-BALANCE-14: попередження з підказаним поділом, за
  // залишком на МОМЕНТ, коли менеджер відкриває список.
  //
  // Знаменник частки дня — усі робочі хвилини працівника за всіма посадами,
  // і їх віддає функція `working_minutes_on`: читати чужі розклади менеджер
  // не може, а одне число — може.
  const employees = [...new Set(decidable.map((r) => r.positions?.employee_id ?? ""))].filter(
    Boolean,
  );
  const balances = new Map<string, Map<string, number>>();
  await Promise.all(
    employees.map(async (employeeId) => {
      const { data: rows } = await supabase.rpc("employee_balance", {
        p_employee_id: employeeId,
        p_school_year: schoolYearOf(new Date().toISOString().slice(0, 10)),
      });
      balances.set(
        employeeId,
        new Map(
          (rows ?? []).map((b) => [
            b.leave_type,
            Math.round((18 + Number(b.carried_over) - Number(b.used)) * 100),
          ]),
        ),
      );
    }),
  );

  const warnings = new Map<string, string>();
  await Promise.all(
    decidable.map(async (record) => {
      const type = record.leave_requests?.leave_type ?? "";
      if (type !== "sick" && type !== "personal") return;

      const employeeId = record.positions?.employee_id;
      const remaining = employeeId ? balances.get(employeeId)?.get(type) : undefined;
      if (remaining === undefined) return;

      const { data: working } = await supabase.rpc("working_minutes_on", {
        p_employee_id: employeeId!,
        p_date: record.on_date,
      });
      const blocks = scheduleFor(
        (record.positions?.schedule_blocks ?? []).map((b) => ({
          weekday: b.weekday,
          startsAt: b.starts_at.slice(0, 5),
          endsAt: b.ends_at.slice(0, 5),
        })),
        record.on_date,
      );
      const minutes = minutesInsideBlocks(blocks, {
        startsAt: record.starts_at.slice(0, 5),
        endsAt: record.ends_at.slice(0, 5),
      });
      const share = dayShare(minutes, Number(working ?? 0));

      if (exceedsBalance(remaining, share)) {
        warnings.set(record.id, managerSplitWarning(type, Math.max(remaining, 0), suggestedSplit(remaining, share)));
      }
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{m("decisions.awaiting")}</h1>

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
            {m("decisions.awaiting")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {decidable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{NO_RECORDS_AWAITING}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m("table.employee")}</TableHead>
                  <TableHead>{m("table.position")}</TableHead>
                  <TableHead>{m("table.dateAndHours")}</TableHead>
                  <TableHead>{m("table.typeAndComment")}</TableHead>
                  <TableHead className="text-right">{m("table.decision")}</TableHead>
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
                        {/* AC-BALANCE-20: менеджер будь-якої посади бачить повний баланс. */}
                        {position?.employee_id ? (
                          <Link
                            href={`/balances/${position.employee_id}`}
                            className="text-xs underline underline-offset-4"
                          >
                            {m("decisions.balancesLink")}
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div>{position?.job_title ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {position ? m(positionKindKey(position.kind)) : ""}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <div>{record.on_date}</div>
                        <div className="text-xs text-muted-foreground">{hours}</div>
                      </TableCell>
                      <TableCell>
                        {/* Тип — назвою, не `sick` із бази (чому — у leaveTypeLabel). */}
                        <div>{leaveTypeLabel(request?.leave_type)}</div>
                        {/* AC-DECIDE-20: коментар працівника видно менеджеру. */}
                        {request?.comment ? (
                          <div className="text-xs text-muted-foreground">{request.comment}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2">
                          {/*
                            Попередження НЕ зупиняє рішення — воно каже, що
                            погодити можна лише з поділом (AC-BALANCE-16).
                            Тому Alert варіанта default, а не destructive.
                          */}
                          {warnings.has(record.id) ? (
                            <Alert data-testid="split-warning">
                              <AlertDescription>{warnings.get(record.id)}</AlertDescription>
                            </Alert>
                          ) : null}
                          <div className="flex justify-end gap-2">
                            {DECISIONS.map((decision) => (
                              <DecisionForm
                                key={decision}
                                recordId={record.id}
                                decision={decision}
                                summary={summary}
                                lang={lang}
                                withSplit={decision === "approved" && warnings.has(record.id)}
                              />
                            ))}
                          </div>
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
            {m("decisions.history")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(history ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{m("decisions.historyEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m("table.when")}</TableHead>
                  <TableHead>{m("table.employeeAndRecord")}</TableHead>
                  <TableHead>{m("table.decision")}</TableHead>
                  <TableHead>{m("table.comment")}</TableHead>
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
        {m("nav.home")}
      </Link>
    </main>
  );
}
