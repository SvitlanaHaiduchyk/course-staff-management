import { cancelRecord, changeRecordHours, requestCancellation } from "@/app/requests/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMessages } from "@/lib/i18n/server";
import { canRequestCancellation } from "@/lib/leave/cancel";
import { canCancel, canEditHours, canResubmit } from "@/lib/leave/record-edit";

/**
 * Дії над власним записом: зміна годин, скасування ще не вирішеного запису й
 * запит на скасування погодженого.
 *
 * Окремим компонентом, бо три форми в клітинці таблиці зробили `RequestsPage`
 * найскладнішою функцією застосунку — це помітив `fallow` (ворота CI).
 *
 * Кнопки показуємо за статусом, і це лише UX: саму відмову дають дії й
 * політики бази (`AC-DECIDE-12`, `AC-CANCEL-05`, `AC-CANCEL-06`).
 */
export async function RequestActions({
  record,
  today,
  hasOpenCancellation,
}: {
  record: { id: string; status: string; on_date: string; starts_at: string; ends_at: string };
  today: string;
  hasOpenCancellation: boolean;
}) {
  const { m } = await getMessages();

  const canAskCancellation = canRequestCancellation({
    status: record.status,
    onDate: record.on_date,
    today,
    hasOpenRequest: hasOpenCancellation,
  });

  const nothingToDo =
    !canEditHours(record.status) && !canCancel(record.status) && !canAskCancellation;

  return (
    <>
      {canEditHours(record.status) ? (
        <form action={changeRecordHours} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="recordId" value={record.id} />
          {canResubmit(record.status) ? <input type="hidden" name="resubmit" value="1" /> : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor={`from-${record.id}`} className="text-xs">
              З
            </Label>
            <Input
              id={`from-${record.id}`}
              name="startsAt"
              type="time"
              required
              defaultValue={record.starts_at.slice(0, 5)}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`to-${record.id}`} className="text-xs">
              До
            </Label>
            <Input
              id={`to-${record.id}`}
              name="endsAt"
              type="time"
              required
              defaultValue={record.ends_at.slice(0, 5)}
              className="w-28"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            {m(canResubmit(record.status) ? "requests.resubmit" : "requests.saveHours")}
          </Button>
        </form>
      ) : null}

      {canCancel(record.status) ? (
        <form action={cancelRecord} className="mt-2">
          <input type="hidden" name="recordId" value={record.id} />
          <Button type="submit" variant="ghost" size="sm">
            Скасувати запис
          </Button>
        </form>
      ) : null}

      {/*
        AC-CANCEL-01: погоджений запис скасовують ЧЕРЕЗ менеджера — працівник
        лише просить і називає причину. Межі «погоджений», «сьогодні або
        пізніше» (AC-CANCEL-05) і «запит уже є» (AC-CANCEL-06) тримає база.
      */}
      {canAskCancellation ? (
        <form action={requestCancellation} className="mt-2 flex flex-col gap-1">
          <input type="hidden" name="recordId" value={record.id} />
          <Label htmlFor={`reason-${record.id}`} className="text-xs">
            {m("requests.cancelReason")}
          </Label>
          <Input
            id={`reason-${record.id}`}
            name="reason"
            required
            maxLength={500}
            className="w-56"
            aria-describedby={`reason-hint-${record.id}`}
          />
          <span id={`reason-hint-${record.id}`} className="text-xs text-muted-foreground">
            {m("requests.cancelReasonHint")}
          </span>
          <Button type="submit" variant="outline" size="sm" className="self-start">
            {m("requests.askCancel")}
          </Button>
        </form>
      ) : null}

      {nothingToDo ? <span className="text-sm text-muted-foreground">—</span> : null}
    </>
  );
}
