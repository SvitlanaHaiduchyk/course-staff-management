import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/leave/decision";

// Статус завжди текстом, колір лише на додачу — вимога PM
// (…spec#14, DESIGN.md розділ «Доступність»). Токени статусів — у globals.css.
const TONE: Record<string, string> = {
  awaiting: "bg-status-awaiting text-status-awaiting-foreground",
  approved: "bg-status-approved text-status-approved-foreground",
  rejected: "bg-status-rejected text-status-rejected-foreground",
  returned: "bg-status-returned text-status-returned-foreground",
  cancelled: "bg-status-cancelled text-status-cancelled-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={TONE[status] ?? "bg-muted text-muted-foreground"}>{statusLabel(status)}</Badge>;
}
