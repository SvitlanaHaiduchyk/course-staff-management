import { LEAVE_TYPE_LABELS } from "@/lib/leave/balance";
import { statusLabel } from "@/lib/leave/decision";
import {
  assignLanes,
  dayNumber,
  geometryOf,
  hhmm,
  hourTicks,
  hourWindow,
  tickPercent,
  WEEKDAY_SHORT,
  weekDates,
  weekdayOf,
} from "@/lib/leave/week";

/**
 * Тиждень розкладу: робочі години смугами, відпустки поверх них, вихідні — порожні.
 *
 * Чому сітка, а не рядок тексту: розклад читають, щоб зрозуміти «коли я вільний»
 * і «що вже погоджено» (основний сценарій `requirements/01-leave-request.md`, крок 2).
 * Рядок `Пн 08:00–16:00 · Вт 08:00–16:00 · …` відповідає на перше питання й ніяк —
 * на друге. Той самий рядок лишився під сіткою: він коротший, його зручно читати
 * з екранним читачем, і на нього спирається сторінка `/requests`.
 *
 * Колір тут нічого не означає сам: у кожній смузі відпустки написано тип і статус
 * словами — пряма вимога PM (…spec#14, DESIGN.md розділ 6). Токени — з DESIGN.md,
 * жодного власного кольору.
 */

/** Посада з тижневим розкладом, як її віддає база. */
export type SchedulePosition = {
  readonly id: string;
  readonly job_title: string;
  readonly schedule_blocks?: readonly {
    readonly weekday: number;
    readonly starts_at: string;
    readonly ends_at: string;
  }[] | null;
};

/** Запис відпустки працівника на конкретну дату. */
export type ScheduleLeave = {
  readonly id: string;
  readonly position_id: string;
  readonly on_date: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly status: string;
  readonly leave_type: string | null;
};

/** Токени статусів із DESIGN.md — ті самі, що в `StatusBadge`. */
const STATUS_TONE: Record<string, string> = {
  awaiting: "bg-status-awaiting text-status-awaiting-foreground",
  approved: "bg-status-approved text-status-approved-foreground",
  rejected: "bg-status-rejected text-status-rejected-foreground",
  returned: "bg-status-returned text-status-returned-foreground",
  cancelled: "bg-status-cancelled text-status-cancelled-foreground",
};

/** Висота однієї години сітки. Доба цілком у картку не влізе й не потрібна. */
const HOUR_HEIGHT_REM = 2.75;

function leaveTypeLabel(type: string | null): string {
  return LEAVE_TYPE_LABELS[type as keyof typeof LEAVE_TYPE_LABELS] ?? "Відпустка";
}

export function ScheduleWeek({
  positions,
  leaves,
  mondayIso,
  todayIso,
}: {
  positions: readonly SchedulePosition[];
  leaves: readonly ScheduleLeave[];
  mondayIso: string;
  todayIso: string;
}) {
  const dates = weekDates(mondayIso);
  const jobTitle = new Map(positions.map((p) => [p.id, p.job_title]));

  // Вікно сітки рахуємо і за розкладом, і за відпустками тижня: відпустка на
  // частину дня може починатися раніше за будь-який блок (погоджена зміна годин).
  const allBlocks = positions.flatMap((p) => [...(p.schedule_blocks ?? [])]);
  const window = hourWindow([...allBlocks, ...leaves]);
  const ticks = hourTicks(window);
  const gridHeight = `${(window.toHour - window.fromHour) * HOUR_HEIGHT_REM}rem`;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto pb-2">
        <div
          className="grid min-w-xl gap-x-1.5"
          style={{ gridTemplateColumns: "3.25rem repeat(7, minmax(0, 1fr))" }}
        >
          <div aria-hidden="true" />
          {dates.map((date) => {
            const isToday = date === todayIso;
            return (
              <div
                key={date}
                className={`mb-2 rounded-md py-1 text-center ${
                  isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                <div className="text-xs">{WEEKDAY_SHORT[weekdayOf(date)]}</div>
                <div
                  className={`text-sm tabular-nums ${isToday ? "font-semibold" : "text-foreground"}`}
                >
                  {dayNumber(date)}
                </div>
              </div>
            );
          })}

          {/* Шкала годин. Підписи висять на тих самих відсотках, що й лінії в стовпцях. */}
          <div className="relative" style={{ height: gridHeight }}>
            {ticks.map((hour) => (
              <span
                key={hour}
                className="absolute right-1.5 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                style={{ top: `${tickPercent(hour, window)}%` }}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {dates.map((date) => {
            const weekday = weekdayOf(date);
            const dayLeaves = leaves.filter((l) => l.on_date === date);
            const dayBlocks = positions.flatMap((p) =>
              (p.schedule_blocks ?? [])
                .filter((b) => b.weekday === weekday)
                .map((b) => ({ ...b, positionId: p.id })),
            );
            const working = assignLanes(dayBlocks);
            const dayOff = dayBlocks.length === 0;

            return (
              <div
                key={date}
                className="relative overflow-hidden rounded-md bg-muted/40 ring-1 ring-border"
                style={{ height: gridHeight }}
              >
                {ticks.slice(1, -1).map((hour) => (
                  <div
                    key={hour}
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: `${tickPercent(hour, window)}%` }}
                  />
                ))}

                {dayOff ? (
                  <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted-foreground">
                    Вихідний
                  </span>
                ) : null}

                {working.map((block) => {
                  const { topPercent, heightPercent } = geometryOf(block, window);
                  const title = jobTitle.get(block.positionId) ?? "";
                  return (
                    <div
                      key={`${block.positionId}-${block.starts_at}`}
                      title={`${title}: ${hhmm(block.starts_at)}–${hhmm(block.ends_at)}`}
                      className="absolute overflow-hidden rounded-sm bg-accent px-1.5 py-1 text-accent-foreground ring-1 ring-ring/40"
                      style={{
                        top: `${topPercent}%`,
                        height: `${heightPercent}%`,
                        left: `${(block.lane / block.lanes) * 100}%`,
                        width: `${100 / block.lanes}%`,
                      }}
                    >
                      <div className="text-xs tabular-nums">
                        {hhmm(block.starts_at)}–{hhmm(block.ends_at)}
                      </div>
                      <div className="truncate text-xs opacity-80">{title}</div>
                    </div>
                  );
                })}

                {/*
                  Відпустка лежить поверх робочих годин: вона їх і замінює.
                  Текст типу й статусу — обов'язковий, колір лише на додачу (…spec#14).
                */}
                {dayLeaves.map((leave) => {
                  const { topPercent, heightPercent } = geometryOf(leave, window);
                  const label = `${leaveTypeLabel(leave.leave_type)} · ${statusLabel(leave.status)}`;
                  return (
                    <div
                      key={leave.id}
                      title={`${label}, ${hhmm(leave.starts_at)}–${hhmm(leave.ends_at)}`}
                      className={`absolute inset-x-0 overflow-hidden rounded-sm px-1.5 py-1 text-xs ring-1 ring-border ${
                        STATUS_TONE[leave.status] ?? "bg-muted text-muted-foreground"
                      }`}
                      style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
                    >
                      {/* Тип і статус — окремими рядками: в один рядок вони не влазять
                          у стовпець дня, а обрізаний статус — це статус, якого не видно. */}
                      <div className="font-medium">{leaveTypeLabel(leave.leave_type)}</div>
                      <div>{statusLabel(leave.status)}</div>
                      <div className="tabular-nums opacity-80">
                        {hhmm(leave.starts_at)}–{hhmm(leave.ends_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-xs bg-accent ring-1 ring-ring/40" />
          Робочі години
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 rounded-xs bg-status-approved ring-1 ring-border"
          />
          Відпустка — тип і статус написано в самій смузі
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-xs bg-muted ring-1 ring-border" />
          Вихідний
        </li>
      </ul>
    </div>
  );
}
