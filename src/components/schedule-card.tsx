import Link from "next/link";

import {
  ScheduleWeek,
  type ScheduleLeave,
  type SchedulePosition,
} from "@/components/schedule-week";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { INTL_LOCALE, messages, weekdayNames, type Lang } from "@/lib/i18n/dict";
import { scheduleSummary } from "@/lib/leave/format";
import { shiftWeeks, weekRangeLabel } from "@/lib/leave/week";

/**
 * Картка «Мій розклад»: навігація по тижнях, сітка і той самий розклад рядком.
 *
 * Окремим компонентом, щоб сторінка `/` лишалася сторінкою — читає дані й
 * складає блоки, а не малює сітку. Ворота `fallow` ловлять саме це:
 * складність `Home` переходила в band «critical».
 */
export function ScheduleCard({
  positions,
  leaves,
  mondayIso,
  todayIso,
  lang,
}: {
  positions: readonly SchedulePosition[];
  leaves: readonly ScheduleLeave[];
  mondayIso: string;
  todayIso: string;
  lang: Lang;
}) {
  const m = messages(lang);
  const dayNames = weekdayNames(lang);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle as="h2" className="text-lg">{m("schedule.title")}</CardTitle>
          <nav aria-label={m("schedule.week")} className="flex items-center gap-2">
            <Link
              href={`/?week=${shiftWeeks(mondayIso, -1)}`}
              aria-label={m("schedule.prev")}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              ←
            </Link>
            <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {m("schedule.thisWeek")}
            </Link>
            <Link
              href={`/?week=${shiftWeeks(mondayIso, 1)}`}
              aria-label={m("schedule.next")}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              →
            </Link>
          </nav>
        </div>
        <p data-testid="week-range" className="text-xs tabular-nums text-muted-foreground">
          {weekRangeLabel(mondayIso, INTL_LOCALE[lang])}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ScheduleWeek
          positions={positions}
          leaves={leaves}
          mondayIso={mondayIso}
          todayIso={todayIso}
          lang={lang}
        />

        {/*
          Той самий розклад рядком, але згорнутий: на екрані він дублював
          сітку, тож лишається за вимогою. Жоден AC PM його не вимагає, однак
          прибирати зовсім не можна з двох причин:

          • сітка — це смуги з абсолютним позиціюванням, і голосом вона
            читається як низка чисел без зв'язку; рядок «Пн 08:30–15:30 · …»
            екранний читач проходить за секунди;
          • сітка показує лише обраний тиждень, а рядок — постійний розклад
            посади: на тижні канікул сітка порожня, і без рядка людина свого
            розкладу не побачила б узагалі.

          `<details>` лишає обидві причини чинними, але з поправкою: згорнутий
          `<details>` ховає вміст і від екранного читача теж, тож автоматично
          він не читається. Зате `<summary>` — це кнопка в порядку табуляції з
          виразною назвою, і розділ відкривається одним натисканням як мишею,
          так і з клавіатури. Тобто розклад лишається досяжним обом, просто не
          займає екран.

          `data-testid="schedule"` тут на жоден тест не спирається (той, що
          спирається, — у формі заявки); лишаємо як точку опори для майбутніх
          перевірок.
        */}
        <details data-testid="schedule" className="border-t border-border pt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            {m("schedule.asText")}
          </summary>
          <dl
            className="mt-3 grid gap-x-6 gap-y-2 text-xs text-muted-foreground"
            style={{ gridTemplateColumns: "max-content 1fr" }}
          >
            {positions.map((p) => (
              <div key={p.id} className="contents">
                <dt>{p.job_title}</dt>
                <dd className="tabular-nums">
                  {p.schedule_blocks?.length
                    ? scheduleSummary(p.schedule_blocks, dayNames)
                    : m("schedule.none")}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </CardContent>
    </Card>
  );
}
