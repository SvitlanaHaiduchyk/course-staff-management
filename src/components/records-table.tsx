import { RecordSubstitute } from "@/components/record-substitute";
import { RequestActions } from "@/components/request-actions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMessages } from "@/lib/i18n/server";
import { formatDays, splitLabel } from "@/lib/leave/balance";
import { type CancellationRow, cancellationNote } from "@/lib/leave/cancel";
import { leaveTypeLabel } from "@/lib/leave/format";

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

export type MyRecord = {
  id: string;
  on_date: string;
  starts_at: string;
  ends_at: string;
  status: string;
  days_on_type: number | null;
  days_unpaid: number | null;
  substitute_id: string | null;
  positions: { job_title: string } | null;
  leave_requests: { leave_type: string; comment: string | null } | null;
};

/**
 * «Мої записи» — таблиця власних записів працівника.
 *
 * Винесено зі сторінки: разом із формою заявки вона зробила `RequestsPage`
 * найскладнішою функцією застосунку, і ворота `fallow` на цьому червоніли.
 * Поведінки це не змінює.
 */
export async function RecordsTable({
  records,
  lastDecision,
  lastCancellation,
  today,
  emailById,
  substituteJobTitleById,
}: {
  records: readonly MyRecord[];
  lastDecision: Map<string, { comment: string | null; decision: string }>;
  lastCancellation: Map<string, CancellationRow>;
  today: string;
  emailById: Map<string, string>;
  substituteJobTitleById: Map<string, string>;
}) {
  const { m } = await getMessages();

  if (records.length === 0) {
    return (
      <p data-testid="records-empty" className="text-sm text-muted-foreground">
        {m("requests.empty")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m("table.date")}</TableHead>
          <TableHead>{m("table.hours")}</TableHead>
          <TableHead>{m("table.position")}</TableHead>
          <TableHead>{m("table.type")}</TableHead>
          <TableHead>{m("table.status")}</TableHead>
          <TableHead>{m("table.chargedAndComment")}</TableHead>
          <TableHead>{m("table.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody data-testid="records">
        {records.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="tabular-nums">{r.on_date}</TableCell>
            <TableCell className="tabular-nums">
              {r.starts_at.slice(0, 5)}–{r.ends_at.slice(0, 5)}
            </TableCell>
            <TableCell>
              {r.positions?.job_title ?? "—"}
              <RecordSubstitute
                email={r.substitute_id ? emailById.get(r.substitute_id) : null}
                absentJobTitle={r.positions?.job_title}
                substituteJobTitle={
                  r.substitute_id ? substituteJobTitleById.get(r.substitute_id) : null
                }
                startsAt={r.starts_at}
                endsAt={r.ends_at}
              />
            </TableCell>
            <TableCell>{leaveTypeLabel(r.leave_requests?.leave_type)}</TableCell>
            <TableCell>
              <Badge className={STATUS_CLASSES[r.status] ?? ""}>
                {STATUS_LABELS[r.status] ?? r.status}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              <ChargedCell record={r} comment={lastDecision.get(r.id)?.comment ?? null} />
              {/*
                AC-CANCEL-01, AC-CANCEL-03, AC-CANCEL-08: позначка про
                скасування — завжди ТЕКСТОМ (DESIGN.md, розділ 7).
              */}
              {cancellationNote(lastCancellation.get(r.id)) ? (
                <div data-testid="cancellation" className="text-foreground">
                  {cancellationNote(lastCancellation.get(r.id))}
                </div>
              ) : null}
            </TableCell>
            <TableCell>
              <RequestActions
                record={r}
                today={today}
                hasOpenCancellation={lastCancellation.get(r.id)?.decision === null}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Списано днів і коментар менеджера.
 *
 * `AC-BALANCE-18`: поділений запис лишається ОДНИМ записом зі своїм типом —
 * поділ показуємо на ньому, а не окремим рядком, і лише коли частина справді
 * пішла в «Unpaid leave».
 */
function ChargedCell({ record, comment }: { record: MyRecord; comment: string | null }) {
  const unpaid = Number(record.days_unpaid ?? 0);
  const onType = Number(record.days_on_type ?? 0);

  return (
    <>
      {record.days_unpaid !== null && unpaid > 0 ? (
        <div data-testid="split" className="tabular-nums text-foreground">
          {splitLabel((record.leave_requests?.leave_type ?? "personal") as "personal", {
            onType: Math.round(onType * 100),
            unpaid: Math.round(unpaid * 100),
          })}
        </div>
      ) : record.days_on_type !== null ? (
        <div className="tabular-nums text-foreground">
          {formatDays(Math.round(onType * 100))} дня
        </div>
      ) : null}
      {comment ?? "—"}
    </>
  );
}
