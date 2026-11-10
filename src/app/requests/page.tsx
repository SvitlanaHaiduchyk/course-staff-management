import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillTabs } from "@/components/ui/pill-tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { INTL_LOCALE, positionKindKey, weekdayNames } from "@/lib/i18n/dict";
import { getMessages } from "@/lib/i18n/server";
import { leaveTypeLabel, scheduleSummary } from "@/lib/leave/format";
import { formatDays, LEAVE_TYPE_LABELS, splitLabel } from "@/lib/leave/balance";
import { canCancel, canEditHours, canResubmit } from "@/lib/leave/record-edit";
import { createClient } from "@/lib/supabase/server";

import { cancelRecord, changeRecordHours, submitLeaveRequest } from "./actions";

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
  const { lang, m } = await getMessages();
  const dayNames = weekdayNames(lang);
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
      "id, on_date, starts_at, ends_at, status, days_on_type, days_unpaid, positions(job_title), leave_requests(leave_type, comment)",
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
          <CardTitle as="h2" className="text-lg">{m("requests.new")}</CardTitle>
        </CardHeader>
        <CardContent>
          {positions && positions.length > 0 ? (
            <form action={submitLeaveRequest} className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">{m("home.positions")}</legend>
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
                          ({m(positionKindKey(p.kind))})
                        </span>
                      </span>
                      <span data-testid="schedule" className="text-xs text-muted-foreground">
                        {p.schedule_blocks?.length
                          ? scheduleSummary(p.schedule_blocks, dayNames)
                          : m("schedule.none")}
                      </span>
                    </span>
                  </Label>
                ))}
              </fieldset>

              {/*
                Дати: нативне поле лишається справжнім полем форми, а календар
                `cally` лише пише в нього. Форма серверна, а веб-компонент без
                JavaScript не існує — див. коментар у `date-field.tsx`.
              */}
              <DateField
                id="date-1"
                name="date"
                label={m("requests.date1")}
                hint={m("requests.dateHint")}
                calendarLabel={m("requests.calendar")}
                prevMonthLabel={m("requests.prevMonth")}
                nextMonthLabel={m("requests.nextMonth")}
                locale={INTL_LOCALE[lang]}
                required
              />

              <DateField
                id="date-2"
                name="date"
                label={m("requests.date2")}
                calendarLabel={m("requests.calendar")}
                prevMonthLabel={m("requests.prevMonth")}
                nextMonthLabel={m("requests.nextMonth")}
                locale={INTL_LOCALE[lang]}
              />

              <div className="flex flex-col gap-2">
                {/*
                  Вкладки-пігулки замість select: чотири типи відпустки видно
                  одразу, без розкривання. Усередині — звичайні радіокнопки з
                  name="leaveType", тож серверна форма приймає їх так само, як
                  приймала select (`@/components/ui/pill-tabs`).

                  Підписи — LEAVE_TYPE_LABELS, тобто дослівні тексти PM: тип
                  відпустки лишається англійською в обох мовах інтерфейсу.
                */}
                <span className="text-sm font-medium">{m("requests.type")}</span>
                <PillTabs
                  name="leaveType"
                  label={m("requests.type")}
                  defaultValue="sick"
                  options={Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  className="self-start"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="relationship">
                  {m("requests.relation")}
                </Label>
                <Input id="relationship" name="relationship" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="comment">{m("requests.comment")}</Label>
                <Textarea id="comment" name="comment" maxLength={500} rows={2}
                />
              </div>

              <Button type="submit" className="self-start">
                {m("requests.submit")}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              {m("requests.noPositions")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg">{m("requests.mine")}</CardTitle>
        </CardHeader>
        <CardContent>
          {records && records.length > 0 ? (
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
                    <TableCell>{r.positions?.job_title ?? "—"}</TableCell>
                    <TableCell>
                      {leaveTypeLabel(r.leave_requests?.leave_type)}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_CLASSES[r.status] ?? ""}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {/*
                        AC-BALANCE-18: поділений запис лишається ОДНИМ записом
                        зі своїм типом — поділ показуємо на ньому, а не окремим
                        рядком. Показуємо лише коли частина справді пішла в
                        «Unpaid leave».
                      */}
                      {r.days_unpaid !== null && Number(r.days_unpaid) > 0 ? (
                        <div data-testid="split" className="tabular-nums text-foreground">
                          {splitLabel(
                            (r.leave_requests?.leave_type ?? "personal") as "personal",
                            {
                              onType: Math.round(Number(r.days_on_type ?? 0) * 100),
                              unpaid: Math.round(Number(r.days_unpaid) * 100),
                            },
                          )}
                        </div>
                      ) : r.days_on_type !== null ? (
                        <div className="tabular-nums text-foreground">
                          {formatDays(Math.round(Number(r.days_on_type) * 100))} дня
                        </div>
                      ) : null}
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
                            {m(canResubmit(r.status) ? "requests.resubmit" : "requests.saveHours")}
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
              {m("requests.empty")}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
