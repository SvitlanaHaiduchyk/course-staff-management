import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { positionKindLabel, scheduleSummary } from "@/lib/leave/format";
import { canCancel, canEditHours, canResubmit } from "@/lib/leave/record-edit";
import { createClient } from "@/lib/supabase/server";

import { cancelRecord, changeRecordHours, submitLeaveRequest } from "./actions";

/** Типи відпустки з глосарію `requirements/product.md`. Кольором не позначаємо — лише текстом. */
const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick leave",
  personal: "Personal leave",
  unpaid: "Unpaid leave",
  family_celebration: "Family celebration",
};

/** П'ять статусів запису — перелік остаточний (припущення PM). Текст обов'язковий, колір на додачу. */
const STATUS_LABELS: Record<string, string> = {
  awaiting: "Awaiting decision",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for revision",
  cancelled: "Cancelled",
};

/** Токени статусів із DESIGN.md. Колір ніколи не несе сенсу сам — поруч завжди текст. */
const STATUS_CLASSES: Record<string, string> = {
  awaiting: "bg-status-awaiting text-status-awaiting-foreground",
  approved: "bg-status-approved text-status-approved-foreground",
  rejected: "bg-status-rejected text-status-rejected-foreground",
  returned: "bg-status-returned text-status-returned-foreground",
  cancelled: "bg-status-cancelled text-status-cancelled-foreground",
};

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    redirect("/login");
  }

  // RLS: працівник бачить лише власні посади (AC-LEAVE-02, AC-LEAVE-03).
  const { data: positions } = await supabase
    .from("positions")
    .select("id, kind, job_title, divisions(name), schedule_blocks(weekday, starts_at, ends_at)")
    .eq("employee_id", claims.sub)
    .order("kind", { ascending: false }); // main перед additional

  // AC-LEAVE-14: лише власні записи. Фільтра за працівником тут немає свідомо —
  // чужі записи відсікає політика leave_records_select_own_managed_or_admin.
  const { data: records } = await supabase
    .from("leave_records")
    .select(
      "id, on_date, starts_at, ends_at, status, positions(job_title), leave_requests(leave_type, comment)",
    )
    .order("on_date", { ascending: false });

  // AC-DECIDE-03, AC-DECIDE-05, AC-DECIDE-23, AC-DECIDE-24: працівник бачить
  // коментар менеджера. Показуємо коментар ОСТАННЬОГО рішення по запису.
  // RLS: політика leave_decisions_select_visible_records віддає лише свої.
  const { data: decisions } = await supabase
    .from("leave_decisions")
    .select("record_id, comment, decision, decided_at")
    .order("decided_at", { ascending: false });

  const lastDecision = new Map<string, { comment: string | null; decision: string }>();
  for (const d of decisions ?? []) {
    if (!lastDecision.has(d.record_id)) {
      lastDecision.set(d.record_id, { comment: d.comment, decision: d.decision });
    }
  }

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
          <CardTitle as="h2" className="text-lg">Нова заявка</CardTitle>
        </CardHeader>
        <CardContent>
          {positions && positions.length > 0 ? (
            <form action={submitLeaveRequest} className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Посади</legend>
                {positions.map((p) => (
                  <Label key={p.id} className="flex items-start gap-2 font-normal">
                    {/*
                      Нативний checkbox, а не Checkbox з @/components/ui: той побудований на
                      @base-ui/react, клієнтський, і подає значення через прихований input.
                      Форма ж серверна (form action), а дія читає formData.getAll("position") —
                      саме на цьому тримаються AC-LEAVE-02 і AC-LEAVE-03. Заміна потребує
                      перевірки подання, тож іде окремою задачею.
                      Колір — семантичний токен, check:design проходить.
                    */}
                    <input
                      type="checkbox"
                      name="position"
                      value={p.id}
                      defaultChecked
                      className="accent-primary mt-1"
                    />
                    <span className="flex flex-col">
                      <span>
                        {p.divisions?.name ?? "—"} / {p.job_title}{" "}
                        <span className="text-muted-foreground">
                          ({positionKindLabel(p.kind)})
                        </span>
                      </span>
                      <span data-testid="schedule" className="text-xs text-muted-foreground">
                        {p.schedule_blocks?.length
                          ? scheduleSummary(p.schedule_blocks)
                          : "розкладу немає"}
                      </span>
                    </span>
                  </Label>
                ))}
              </fieldset>

              <div className="flex flex-col gap-2">
                <Label htmlFor="date-1">Дата (цілий день)</Label>
                <Input id="date-1" name="date" type="date" required />
                <p className="text-xs text-muted-foreground">
                  Обирайте день, що є в розкладі вище. Дата без робочих годин відпаде з
                  повідомленням, а решта дат заявки лишаться.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="date-2">Ще дата (не обов&apos;язково)</Label>
                <Input id="date-2" name="date" type="date" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="leaveType">Тип відпустки</Label>
                {/*
                  Нативний select із тієї ж причини, що й checkbox вище: Select із
                  @/components/ui клієнтський (@base-ui/react), а форма серверна.
                  Класи — лише семантичні токени.
                */}
                <select
                  id="leaveType"
                  name="leaveType"
                  required
                  defaultValue="sick"
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="relationship">
                  Ступінь спорідненості (лише для Family celebration)
                </Label>
                <Input id="relationship" name="relationship" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="comment">Коментар (до 500 символів)</Label>
                <Textarea id="comment" name="comment" maxLength={500} rows={2}
                />
              </div>

              <Button type="submit" className="self-start">
                Подати заявку
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              У вас ще немає посад з розкладом. Їх створює адміністратор (зріз WS10).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg">Мої записи</CardTitle>
        </CardHeader>
        <CardContent>
          {records && records.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Години</TableHead>
                  <TableHead>Посада</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Коментар менеджера</TableHead>
                  <TableHead>Дії</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="records">
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{r.on_date}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.starts_at.slice(0, 5)}–{r.ends_at.slice(0, 5)}
                    </TableCell>
                    <TableCell>{r.positions?.job_title ?? "—"}</TableCell>
                    <TableCell>
                      {LEAVE_TYPE_LABELS[r.leave_requests?.leave_type ?? ""] ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_CLASSES[r.status] ?? ""}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lastDecision.get(r.id)?.comment ?? "—"}
                    </TableCell>
                    <TableCell>
                      {/*
                        Кнопки показуємо за статусом — це UX. Саму відмову дає дія
                        й політика leave_records_update_own_pending: запис у статусі
                        «Approved» не зміниться й прямим запитом (AC-DECIDE-12).
                      */}
                      {canEditHours(r.status) ? (
                        <form
                          action={changeRecordHours}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="recordId" value={r.id} />
                          {canResubmit(r.status) ? (
                            <input type="hidden" name="resubmit" value="1" />
                          ) : null}
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`from-${r.id}`} className="text-xs">
                              З
                            </Label>
                            <Input
                              id={`from-${r.id}`}
                              name="startsAt"
                              type="time"
                              required
                              defaultValue={r.starts_at.slice(0, 5)}
                              className="w-28"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`to-${r.id}`} className="text-xs">
                              До
                            </Label>
                            <Input
                              id={`to-${r.id}`}
                              name="endsAt"
                              type="time"
                              required
                              defaultValue={r.ends_at.slice(0, 5)}
                              className="w-28"
                            />
                          </div>
                          <Button type="submit" variant="outline" size="sm">
                            {canResubmit(r.status) ? "Подати знову" : "Зберегти години"}
                          </Button>
                        </form>
                      ) : null}
                      {canCancel(r.status) ? (
                        <form action={cancelRecord} className="mt-2">
                          <input type="hidden" name="recordId" value={r.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Скасувати запис
                          </Button>
                        </form>
                      ) : null}
                      {!canEditHours(r.status) && !canCancel(r.status) ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p data-testid="records-empty" className="text-sm text-muted-foreground">
              Записів ще немає.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
