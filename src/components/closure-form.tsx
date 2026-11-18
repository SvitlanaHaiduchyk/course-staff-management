import { DateField } from "@/components/ui/date-field";
import type { MessageKey } from "@/lib/i18n/dict";
import { PillTabs } from "@/components/ui/pill-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Форма додавання закриття шкільного календаря.
 *
 * Окремим компонентом, щоб сторінка лишалася сторінкою — читає дані й складає
 * блоки, а не малює поля (те саме, що з `ClosureList` і `BalanceTable`).
 *
 * Обидва види закриття показуємо **одночасно**, а не перемикаємо полями через
 * JavaScript: форма серверна й має лишатися робочою без нього. Який із двох
 * наборів полів застосовується, каже вибір «цілі дні / скорочений день» і
 * підписи під полями. Зайве поле база просто не читає.
 */
export function ClosureForm({
  action,
  m,
  locale,
}: {
  action: (formData: FormData) => void | Promise<void>;
  m: (key: MessageKey) => string;
  /** Локаль календаря — з `INTL_LOCALE`, не зі словника. */
  locale: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="closure-name">{m("calendar.name")}</Label>
        {/*
          maxLength не ставимо: AC-CAL-19 вимагає ПОВІДОМЛЕННЯ про задовгу
          назву, а поле, яке мовчки обрізає ввід, його не покаже. Межу
          перевіряє add_school_closure.
        */}
        <Input id="closure-name" name="name" required />
        <p className="text-xs text-muted-foreground">{m("calendar.nameHint")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{m("calendar.kind")}</span>
        <PillTabs
          name="kind"
          label={m("calendar.kind")}
          defaultValue="whole"
          options={[
            { value: "whole", label: m("calendar.kindWhole") },
            { value: "early", label: m("calendar.kindEarly") },
          ]}
          className="self-start"
        />
      </div>

      <DateField
        id="closure-starts"
        name="startsOn"
        label={m("calendar.startsOn")}
        hint={m("calendar.startsOnHint")}
        calendarLabel={m("requests.calendar")}
        prevMonthLabel={m("requests.prevMonth")}
        nextMonthLabel={m("requests.nextMonth")}
        locale={locale}
        required
      />

      <DateField
        id="closure-ends"
        name="endsOn"
        label={m("calendar.endsOn")}
        hint={m("calendar.endsOnHint")}
        calendarLabel={m("requests.calendar")}
        prevMonthLabel={m("requests.prevMonth")}
        nextMonthLabel={m("requests.nextMonth")}
        locale={locale}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="closure-closes">{m("calendar.closesAt")}</Label>
        {/* step=300 — крок 5 хвилин; те саме обмеження тримає база. */}
        <Input id="closure-closes" name="closesAt" type="time" step={300} className="w-32" />
        <p className="text-xs text-muted-foreground">{m("calendar.closesAtHint")}</p>
      </div>

      <Button type="submit" className="self-start">
        {m("calendar.add")}
      </Button>
    </form>
  );
}
