import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMessages } from "@/lib/i18n/server";
import {
  COVERING_STATUSES,
  NOT_COVERING_ANYONE,
  minutesBetween,
  upgradeMark,
} from "@/lib/leave/substitutes";
import { createClient } from "@/lib/supabase/server";

/** П'ять статусів запису — текст обов'язковий, колір лише на додачу (DESIGN.md). */
const STATUS_LABELS: Record<string, string> = {
  awaiting: "Awaiting decision",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for revision",
  cancelled: "Cancelled",
};

const STATUS_CLASSES: Record<string, string> = {
  awaiting: "bg-status-awaiting text-status-awaiting-foreground",
  approved: "bg-status-approved text-status-approved-foreground",
  rejected: "bg-status-rejected text-status-rejected-foreground",
  returned: "bg-status-returned text-status-returned-foreground",
  cancelled: "bg-status-cancelled text-status-cancelled-foreground",
};

const hhmm = (time: string) => time.slice(0, 5);

/**
 * «Мої заміни» — записи, де ця людина підміняє когось (AC-SUBST-10, AC-SUBST-15).
 *
 * Це не її відпустки: тут видно чужі відсутності, які вона закриває.
 * Неавторизованого на сторінку не пускає `src/proxy.ts` (AC-SUBST-14), а
 * чужих записів не віддає політика `leave_records_select_substitute`.
 */
export default async function SubstitutionsPage() {
  const { m } = await getMessages();
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  // Фільтра «де я заміна» тут немає свідомо: його робить політика. Статуси —
  // ті три, які PM називає ознакою непорожньої сторінки (AC-SUBST-15).
  const { data: records } = await supabase
    .from("leave_records")
    .select(
      `id, on_date, starts_at, ends_at, status, substitute_id,
       positions(job_title, profiles!positions_employee_id_fkey(email, full_name)),
       leave_requests(leave_type)`,
    )
    .eq("substitute_id", data.claims.sub)
    .in("status", [...COVERING_STATUSES])
    .order("on_date");

  // Основна посада самої людини: від її назви залежить позначка підвищення
  // (AC-SUBST-08) — «Assistant» замість «Teacher».
  const { data: myPositions } = await supabase
    .from("positions")
    .select("job_title, kind")
    .eq("employee_id", data.claims.sub)
    .eq("kind", "main");

  const myJobTitle = myPositions?.[0]?.job_title ?? null;
  const rows = records ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{m("substitutions.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg font-medium">
            {m("substitutions.subtitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p data-testid="substitutions-empty" className="text-sm text-muted-foreground">
              {NOT_COVERING_ANYONE}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m("table.date")}</TableHead>
                  <TableHead>{m("table.hours")}</TableHead>
                  <TableHead>{m("substitutions.forWhom")}</TableHead>
                  <TableHead>{m("table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="substitutions">
                {rows.map((r) => {
                  const mark = upgradeMark({
                    absentJobTitle: r.positions?.job_title,
                    substituteJobTitle: myJobTitle,
                    minutes: minutesBetween(r.starts_at, r.ends_at),
                  });
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">{r.on_date}</TableCell>
                      <TableCell className="tabular-nums">
                        {hhmm(r.starts_at)}–{hhmm(r.ends_at)}
                      </TableCell>
                      <TableCell>
                        <div>{r.positions?.profiles?.email ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.positions?.job_title ?? "—"}
                        </div>
                        {/* AC-SUBST-08: позначка підвищення — завжди текстом. */}
                        {mark ? (
                          <div data-testid="upgrade" className="mt-1 text-sm tabular-nums">
                            {mark}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_CLASSES[r.status] ?? ""}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
