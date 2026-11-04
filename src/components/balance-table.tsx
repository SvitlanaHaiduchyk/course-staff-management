import { type Hundredths, LEAVE_TYPES, balanceRow, formatDays } from "@/lib/leave/balance";
import { type LeaveType } from "@/lib/leave/build";
import { messages, type Lang } from "@/lib/i18n/dict";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Рядок, як його повертає `public.employee_balance`. */
export type BalanceRpcRow = {
  readonly leave_type: string;
  readonly carried_over: number;
  readonly used: number;
};

const toHundredths = (days: number): Hundredths => Math.round(days * 100);

/**
 * Залишки за чотирма типами відпустки (AC-BALANCE-01).
 *
 * «Unpaid leave» і «Family celebration» ліміту не мають, тож у них лише
 * «використано» — у решті клітинок тире, а не нуль: нуль читався б як
 * «ліміт є, і він вичерпаний».
 *
 * Числа — `tabular-nums`, щоб їх можна було порівнювати поглядом згори вниз.
 */
export function BalanceTable({ rows, lang }: { rows: readonly BalanceRpcRow[]; lang: Lang }) {
  const byType = new Map(rows.map((r) => [r.leave_type, r]));
  const m = messages(lang);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m("balances.type")}</TableHead>
          <TableHead className="text-right">{m("balances.granted")}</TableHead>
          <TableHead className="text-right">{m("balances.carried")}</TableHead>
          <TableHead className="text-right">{m("balances.used")}</TableHead>
          <TableHead className="text-right">{m("balances.remaining")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody data-testid="balances">
        {LEAVE_TYPES.map((type: LeaveType) => {
          const rpc = byType.get(type);
          const row = balanceRow({
            type,
            carriedOver: toHundredths(Number(rpc?.carried_over ?? 0)),
            used: toHundredths(Number(rpc?.used ?? 0)),
          });

          return (
            <TableRow key={type}>
              <TableCell>{row.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.granted === null ? "—" : formatDays(row.granted)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.granted === null ? "—" : formatDays(row.carriedOver)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatDays(row.used)}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {row.remaining === null ? "—" : formatDays(row.remaining)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
