import { messages, weekdayNames, type Lang, type MessageKey } from "@/lib/i18n/dict";
import { blocksOn, type DayBlock } from "@/lib/leave/calendar-overlay";
import { daySegments, hoursLabel, spanLabel, type DaySegment } from "@/lib/leave/day-plan";
import { statusLabel } from "@/lib/leave/decision";
import { leaveTypeLabel } from "@/lib/leave/format";
import { lessonLabel, lessonsOn, positionLabel, type LessonRow } from "@/lib/leave/lessons";
import { dayNumber, weekDates, weekdayOf } from "@/lib/leave/week";

/**
 * Тиждень розкладу: день — це блоки посад, усередині блоку — підблоки занять.
 *
 * Було: смуги на пропорційній шкалі годин. Чому більше ні — пояснено в
 * `day-plan.ts`: у стовпці завширшки 60 px назва уроку обрізалася завжди
 * («Nature study, 4-A» → «Nature s…»), а пропорційну висоту й достатню ширину
 * одночасно екран не вміщав. Тепер блок росте під вміст, тож обрізати нічого
 * не треба: назву підрозділу видно цілком, назву уроку — теж.
 *
 * Що це коштує: тривалість більше не видно оком — урок на 45 хвилин і нарада
 * на годину виглядають однаково. Тому кожен підблок підписано часом, а
 * проміжки названо словами: «вільно» всередині робочих годин і «перерва» між
 * блоками розкладу. Це різні речі, і плутати їх не можна.
 *
 * Колір тут нічого не означає сам: у кожному підблоці відпустки написано тип і
 * статус словами — пряма вимога PM (…spec#14, DESIGN.md розділ 6). Токени — з
 * DESIGN.md, жодного власного кольору.
 */

/** Посада з тижневим розкладом, як її віддає база. */
export type SchedulePosition = {
  readonly id: string;
  readonly job_title: string;
  /** Підрозділ посади — його видно в заголовку блоку дня. */
  readonly divisions?: { readonly name: string } | null;
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

/** Вигляд підблоків. У константах, бо ті самі класи потрібні легенді. */
const LESSON_BOX = "rounded-sm border border-input bg-card px-1.5 py-1 text-card-foreground";
const POSITION_BOX = "rounded-md bg-muted/50 p-1.5";

/** Підблок дня: або заняття, або запис відпустки. Тег вирішує, як малювати. */
type DayEntry =
  | {
      readonly tag: "lesson";
      readonly starts_at: string;
      readonly ends_at: string;
      readonly lesson: LessonRow;
    }
  | {
      readonly tag: "leave";
      readonly starts_at: string;
      readonly ends_at: string;
      readonly leave: ScheduleLeave;
    };

export function ScheduleWeek({
  positions,
  leaves,
  lessons,
  mondayIso,
  todayIso,
  lang,
}: {
  positions: readonly SchedulePosition[];
  leaves: readonly ScheduleLeave[];
  /** Заняття всіх посад людини; день із них вибирає `lessonsOn`. */
  lessons: readonly LessonRow[];
  mondayIso: string;
  todayIso: string;
  lang: Lang;
}) {
  const m = messages(lang);
  const dayNames = weekdayNames(lang);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-4xl grid-cols-7 items-start gap-2">
          {weekDates(mondayIso).map((date) => (
            <DayColumn
              key={date}
              date={date}
              dayName={dayNames[weekdayOf(date)]}
              isToday={date === todayIso}
              positions={positions}
              lessons={lessonsOn(lessons, date)}
              leaves={leaves.filter((leave) => leave.on_date === date)}
              m={m}
            />
          ))}
        </div>
      </div>

      <Legend m={m} />
    </div>
  );
}

function Legend({ m }: { m: (key: MessageKey) => string }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-3 rounded-xs bg-muted ring-1 ring-border" />
        {m("schedule.legend.work")}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-3 rounded-xs border border-input bg-card" />
        {m("lessons.legend")}
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-xs bg-status-approved ring-1 ring-border"
        />
        {m("schedule.legend.leave")}
      </li>
    </ul>
  );
}

/**
 * Один день: шапка з датою і блок на кожну посаду, що працює цього дня.
 *
 * Посад може бути дві в різних підрозділах (`AC-LEAVE-02`), і тоді блоків теж
 * два — кожен зі своєю назвою й своїми годинами. Саме це й відповідає на
 * питання «де я і з котрої по котру».
 */
function DayColumn({
  date,
  dayName,
  isToday,
  positions,
  lessons,
  leaves,
  m,
}: {
  date: string;
  dayName: string;
  isToday: boolean;
  positions: readonly SchedulePosition[];
  lessons: readonly LessonRow[];
  leaves: readonly ScheduleLeave[];
  m: (key: MessageKey) => string;
}) {
  const working = positions
    .map((position) => ({ position, blocks: blocksOn([position], date) }))
    .filter((entry) => entry.blocks.length > 0);

  return (
    <section className="flex flex-col gap-2">
      <DayHeader date={date} dayName={dayName} isToday={isToday} />

      {working.length === 0 ? (
        <p className="rounded-md bg-muted/30 py-6 text-center text-xs text-muted-foreground">
          {m("schedule.dayOff")}
        </p>
      ) : (
        working.map(({ position, blocks }) => (
          <PositionBlock
            key={position.id}
            position={position}
            blocks={blocks}
            lessons={lessons.filter((lesson) => lesson.position_id === position.id)}
            leaves={leaves.filter((leave) => leave.position_id === position.id)}
            m={m}
          />
        ))
      )}
    </section>
  );
}

/** Шапка дня: назва дня тижня й число, сьогодні — заливкою й `aria-current`. */
function DayHeader({
  date,
  dayName,
  isToday,
}: {
  date: string;
  dayName: string;
  isToday: boolean;
}) {
  return (
    <header
      aria-current={isToday ? "date" : undefined}
      className={`rounded-md py-1 text-center ${
        isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      <div className="text-xs">{dayName}</div>
      <div className={`text-sm tabular-nums ${isToday ? "font-semibold" : "text-foreground"}`}>
        {dayNumber(date)}
      </div>
    </header>
  );
}

/**
 * Блок посади: назва з годинами всередині, підблоки занять і відпусток під нею.
 *
 * Години перелічено блоками розкладу, а не загальним проміжком: «08:30–15:30»
 * на день із перервою сказало б, що людина працює й о 12:15.
 */
function PositionBlock({
  position,
  blocks,
  lessons,
  leaves,
  m,
}: {
  position: SchedulePosition;
  blocks: readonly DayBlock[];
  lessons: readonly LessonRow[];
  leaves: readonly ScheduleLeave[];
  m: (key: MessageKey) => string;
}) {
  const entries: DayEntry[] = [
    ...lessons.map((lesson) => ({
      tag: "lesson" as const,
      starts_at: lesson.starts_at,
      ends_at: lesson.ends_at,
      lesson,
    })),
    ...leaves.map((leave) => ({
      tag: "leave" as const,
      starts_at: leave.starts_at,
      ends_at: leave.ends_at,
      leave,
    })),
  ];

  return (
    <div className={`${POSITION_BOX} flex flex-col gap-1`}>
      <p className="text-xs text-muted-foreground">
        {positionLabel(position)}
        <br />
        <span className="tabular-nums">{hoursLabel(blocks)}</span>
      </p>

      {daySegments(blocks, entries).map((segment) => (
        <DaySegmentView key={`${segment.kind}-${segment.starts_at}`} segment={segment} m={m} />
      ))}
    </div>
  );
}

/** Один відрізок дня: заняття, відпустка, вільний час або перерва. */
function DaySegmentView({
  segment,
  m,
}: {
  segment: DaySegment<DayEntry>;
  m: (key: MessageKey) => string;
}) {
  if (segment.kind !== "entry") {
    // Вільний час і перерву малюємо рядком, а не коробкою: вони нічого не
    // містять, і коробка навколо порожнечі читалася б як ще одна подія дня.
    return (
      <p className="px-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">{spanLabel(segment)}</span>{" "}
        {m(segment.kind === "free" ? "schedule.free" : "schedule.break")}
      </p>
    );
  }

  if (segment.entry.tag === "lesson") {
    return (
      <div className={LESSON_BOX}>
        <div className="text-xs tabular-nums text-muted-foreground">{spanLabel(segment)}</div>
        <div className="text-xs font-medium">{lessonLabel(segment.entry.lesson)}</div>
      </div>
    );
  }

  return <LeaveBox leave={segment.entry.leave} label={spanLabel(segment)} />;
}

/** Відпустка: тип і статус — завжди текстом, колір лише на додачу (…spec#14). */
function LeaveBox({ leave, label }: { leave: ScheduleLeave; label: string }) {
  return (
    <div
      className={`rounded-sm px-1.5 py-1 ring-1 ring-border ${
        STATUS_TONE[leave.status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      <div className="text-xs tabular-nums">{label}</div>
      <div className="text-xs font-medium">{leaveTypeLabel(leave.leave_type)}</div>
      <div className="text-xs">{statusLabel(leave.status)}</div>
    </div>
  );
}
