import { submitLeaveRequest } from "@/app/requests/actions";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillTabs } from "@/components/ui/pill-tabs";
import { Textarea } from "@/components/ui/textarea";
import { INTL_LOCALE, positionKindKey, weekdayNames, type Lang } from "@/lib/i18n/dict";
import { getMessages } from "@/lib/i18n/server";
import { LEAVE_TYPE_LABELS } from "@/lib/leave/balance";
import { scheduleSummary } from "@/lib/leave/format";

/** Посада працівника так, як її віддає сторінка заявки. */
export type RequestPosition = {
  id: string;
  kind: string;
  job_title: string;
  divisions: { name: string } | null;
  schedule_blocks: { weekday: number; starts_at: string; ends_at: string }[] | null;
};

/**
 * Форма подання заявки.
 *
 * Винесено зі сторінки разом із таблицею записів: разом вони робили
 * `RequestsPage` найскладнішою функцією застосунку, і ворота `fallow`
 * на цьому червоніли. Поведінки це не змінює — лише межі файлів.
 */
export async function RequestForm({
  positions,
  lang,
}: {
  positions: readonly RequestPosition[];
  lang: Lang;
}) {
  const { m } = await getMessages();
  const dayNames = weekdayNames(lang);

  return (
    <>
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

          {/* Видно лише для Family celebration; показ вирішує CSS — див. globals.css. */}
          <div className="relationship-field flex-col gap-2">
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
    </>
  );
}
