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
          Той самий розклад рядком. Лишається з трьох причин: екранний читач
          пройде його за секунди замість сітки з абсолютних смуг, він не
          залежить від обраного тижня, і на `data-testid="schedule"` уже
          спираються перевірки.
        */}
        <dl
          data-testid="schedule"
          className="grid gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground"
          style={{ gridTemplateColumns: "max-content 1fr" }}
        >
          {positions.map((p) => (
            <div key={p.id} className="contents">
              <dt>{p.job_title}</dt>
              <dd className="tabular-nums">
                {p.schedule_blocks?.length ? scheduleSummary(p.schedule_blocks, dayNames) : m("schedule.none")}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
