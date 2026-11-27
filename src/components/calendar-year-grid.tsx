import { cn } from "cn";
import type { MessageKey } from "@/lib/i18n/dict";
import type { ClosureRow } from "@/lib/leave/calendar";
import {
  closureOnDate,
  leadingBlanks,
  longDate,
  monthDates,
  monthLabel,
  monthsOfSchoolYear,
  type MonthKey,
} from "@/lib/leave/calendar-grid";
import {
  blocksOn,
  openBlocks,
  type DayBlock,
  type LeaveMark,
  type TimedPosition,
} from "@/lib/leave/calendar-overlay";
import { statusLabel } from "@/lib/leave/decision";
import { lessonLabel, lessonsOn, type LessonRow } from "@/lib/leave/lessons";
import { leaveTypeLabel } from "@/lib/leave/format";
import { hhmm } from "@/lib/leave/week";

/**
 * Сітка навчального року: закриття школи, власні відпустки, робочі дні й
 * сьогоднішня дата.
 *
 * Три шари навмисно різними засобами, і кожен підписано словами в легенді:
 * закриття — заливкою, відпустка — іншою заливкою, сьогодні — кільцем,
 * неробочий день — приглушеним числом. Колір ніде не єдиний носій сенсу:
 * у кожної позначеної клітинки є `aria-label`, натискання відкриває віконечко
 * з тим самим текстом, а перелік закриттів лишається під сіткою.
 *
 * Чому особисті шари взагалі тут: вимоги PM описують спільні закриття, але
 * людина дивиться на рік, щоб побачити СВОЮ картину. Жодного правила вимог це
 * не змінює — додано лише те, що портал і так показує про людину в розкладі
 * й у заявках.
 *
 * Віконечко дня показує ще й години цього дня — ті самі блоки, які малює
 * тижнева сітка «Мого розкладу»: обидва місця кличуть `blocksOn`, тож другої
 * відповіді на питання «коли я працюю такого-то числа» в порталі немає.
 *
 * Під годинами — заняття цього дня (уроки, наради). Це інше поняття, ніж
 * робочі години, і в тексті вони розділені: години створює адміністратор і з
 * них рахується баланс, заняття веде сама людина й жодне обчислення їх не
 * читає (ADR 0004).
 */
export function CalendarYearGrid({
  closures,
  year,
  locale,
  today,
  positions,
  leaves,
  lessons,
  m,
}: {
  closures: readonly ClosureRow[];
  year: number;
  locale: string;
  /** Сьогоднішня дата за Києвом — приходить із сервера, не з браузера. */
  today: string;
  /** Власні посади з розкладом: з них і робочі дні тижня, і години дня. */
  positions: readonly TimedPosition[];
  /** Власні відпустки за датами; на одну дату може бути кілька — по посаді. */
  leaves: ReadonlyMap<string, readonly LeaveMark[]>;
  /** Власні заняття тижня; день із них вибирає `lessonsOn`. */
  lessons: readonly LessonRow[];
  /** Перекладач сторінки — як у `AssistantTextForm`: підписи складає компонент. */
  m: (key: MessageKey) => string;
}) {
  // Сітку малюємо завжди, навіть за порожнього року: порожній місяць — це
  // відповідь «цього місяця нічого не закрито», а не підозра на поломку.
  const months = monthsOfSchoolYear(year);
  const weekdays = weekdayLabels(locale);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((key) => (
          <MonthCard
            key={`${key.year}-${key.month}`}
            monthKey={key}
            closures={closures}
            locale={locale}
            weekdays={weekdays}
            today={today}
            positions={positions}
            leaves={leaves}
            lessons={lessons}
            m={m}
          />
        ))}
      </div>

      <Legend m={m} />
    </div>
  );
}

/**
 * Вигляд позначених клітинок. Винесено в константи, бо ті самі класи потрібні
 * легенді: якби вона малювалася окремо, зразок і сітка з часом розійшлися б.
 */
const CLOSED_CELL =
  "rounded-sm bg-accent py-1 font-medium tabular-nums text-accent-foreground ring-1 ring-ring/40";
const EARLY_CELL =
  "rounded-sm bg-muted py-1 font-medium tabular-nums text-foreground ring-1 ring-dashed ring-ring/40";
/**
 * Відпустка — кольором СТАТУСУ, а не окремою заливкою.
 *
 * Спершу тут був `bg-secondary`, і у світлій темі він майже зливався з
 * `bg-accent` закриттів: 0.95 проти 0.94 світлоти (DESIGN.md, розділ 2) —
 * виміряно у браузері, різниці не видно. Токени статусів для цього й створені,
 * і заразом видно, чи відпустка вже погоджена. Статус у віконечку — завжди
 * текстом (вимога PM, …spec#14), колір лише на додачу.
 *
 * Класи цілими рядками, а не складені з частин: Tailwind шукає їх у коді
 * дослівно, тож `bg-status-${status}` не потрапив би у збірку.
 */
const LEAVE_CELL_BASE = "rounded-sm py-1 font-medium tabular-nums ring-1 ring-ring/40";
const LEAVE_TONE: Record<string, string> = {
  awaiting: "bg-status-awaiting text-status-awaiting-foreground",
  approved: "bg-status-approved text-status-approved-foreground",
  returned: "bg-status-returned text-status-returned-foreground",
};

function leaveCellClass(status: string): string {
  return cn(LEAVE_CELL_BASE, LEAVE_TONE[status] ?? "bg-secondary text-secondary-foreground");
}
/**
 * Робочий день — легка заливка. Саме легка: таких днів у вчителя ~250 із 365,
 * і сильна заливка перетворила б сітку на суцільну пляму, у якій закриття й
 * відпустки загубилися б. Неробочий день лишається без заливки й приглушеним —
 * різниця видно смугами, а не окремими числами.
 */
const WORK_CELL = "rounded-sm bg-muted/50 py-1 tabular-nums text-foreground";
const OFF_CELL = "rounded-sm py-1 tabular-nums text-muted-foreground/60";
/**
 * Сьогодні — кільце, а не заливка: заливкою вже позначені закриття й відпустки,
 * і якби сьогоднішній день теж заливався, різні повідомлення злилися б в одне.
 * Кільце лягає поверх будь-якої клітинки.
 */
const TODAY_RING = "ring-2 ring-primary";

/** Зразки позначок зі словами — колір сам по собі нічого не повідомляє. */
function Legend({ m }: { m: (key: MessageKey) => string }) {
  const items: readonly { readonly cell: string; readonly day: string; readonly label: string }[] = [
    { cell: `${WORK_CELL} ${TODAY_RING}`, day: "24", label: m("calendar.gridToday") },
    { cell: CLOSED_CELL, day: "28", label: m("calendar.gridWholeDay") },
    { cell: EARLY_CELL, day: "20", label: m("calendar.gridEarly") },
    { cell: leaveCellClass("approved"), day: "12", label: m("calendar.gridLeave") },
    { cell: WORK_CELL, day: "25", label: m("calendar.gridWorkDay") },
    { cell: OFF_CELL, day: "29", label: m("calendar.gridOffDay") },
  ];

  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span aria-hidden="true" className={`${item.cell} w-7 text-center`}>
            {item.day}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Підписи днів тижня, з понеділка, мовою інтерфейсу: «пн, вт, …». */
function weekdayLabels(locale: string): readonly string[] {
  // 2026-11-23 — понеділок; беремо сім послідовних днів від нього.
  return Array.from({ length: 7 }, (_, index) =>
    new Date(Date.UTC(2026, 10, 23 + index)).toLocaleDateString(locale, {
      weekday: "short",
      timeZone: "UTC",
    }),
  );
}

function MonthCard({
  monthKey,
  closures,
  locale,
  weekdays,
  today,
  positions,
  leaves,
  lessons,
  m,
}: {
  monthKey: MonthKey;
  closures: readonly ClosureRow[];
  locale: string;
  weekdays: readonly string[];
  today: string;
  positions: readonly TimedPosition[];
  leaves: ReadonlyMap<string, readonly LeaveMark[]>;
  lessons: readonly LessonRow[];
  m: (key: MessageKey) => string;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-3">
      <h3 className="text-sm font-medium first-letter:uppercase">
        {monthLabel(monthKey, locale)}
      </h3>

      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {weekdays.map((day) => (
          <span key={day} className="pb-1 text-muted-foreground first-letter:uppercase">
            {day}
          </span>
        ))}

        {Array.from({ length: leadingBlanks(monthKey) }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}

        {monthDates(monthKey).map((date) => (
          <DayCell
            key={date}
            date={date}
            closure={closureOnDate(closures, date)}
            dayLeaves={leaves.get(date) ?? []}
            blocks={blocksOn(positions, date)}
            dayLessons={lessonsOn(lessons, date)}
            locale={locale}
            isToday={date === today}
            m={m}
          />
        ))}
      </div>
    </section>
  );
}

type DayProps = {
  date: string;
  closure: ClosureRow | null;
  dayLeaves: readonly LeaveMark[];
  /** Години цього дня за розкладом посад — те саме, що показує «Мій розклад». */
  blocks: readonly DayBlock[];
  /** Заняття цього дня: уроки й наради всередині робочих годин. */
  dayLessons: readonly LessonRow[];
  locale: string;
  isToday: boolean;
  m: (key: MessageKey) => string;
};

/**
 * Клітинка дня: заливка за шаром, віконечко — з усім, що про день відомо.
 *
 * Порядок заливки саме такий: закриття школи важливіше за власну відпустку
 * (воно стосується всіх і скасовує робочий день), а відпустка важливіша за
 * «просто робочий день». Віконечко ж нічого не витісняє: коли на дату припали
 * і закриття, і відпустка, і години розкладу — видно всі три рядки.
 */
function DayCell(props: DayProps) {
  const { closure, dayLeaves, blocks, dayLessons, isToday, locale, m } = props;
  const wholeDay = closure !== null && closure.closes_at === null;
  const open = openBlocks(blocks, closure);

  const cellClass = closure
    ? wholeDay
      ? CLOSED_CELL
      : EARLY_CELL
    : dayLeaves.length > 0
      ? leaveCellClass(dayLeaves[0].status)
      : blocks.length > 0
        ? WORK_CELL
        : OFF_CELL;

  return (
    <MarkedDay
      date={props.date}
      label={dayLabel(props, open)}
      cellClass={cellClass}
      isToday={isToday}
      locale={locale}
    >
      {closure ? <ClosureLines closure={closure} wholeDay={wholeDay} m={m} /> : null}
      <LeaveLines dayLeaves={dayLeaves} />
      <ScheduleLines blocks={blocks} open={open} closed={closure !== null} m={m} />
      <LessonLines dayLessons={dayLessons} m={m} />
    </MarkedDay>
  );
}

/**
 * Підпис клітинки одним рядком — для екранного читача й підказки миші.
 *
 * Той самий зміст, що й у віконечку: колір клітинки нічого не повідомляє сам
 * (вимога PM, …spec#14), тож усе, що видно оком, має бути й тут словами.
 */
function dayLabel(
  { date, closure, dayLeaves, blocks, dayLessons, isToday, m }: DayProps,
  open: readonly DayBlock[],
): string {
  const hours =
    open.length > 0
      ? open.map((block) => `${hhmm(block.starts_at)}–${hhmm(block.ends_at)}`).join(", ")
      : m(noHoursKey(blocks, closure !== null));

  return [
    date,
    ...closureParts(closure, m),
    ...dayLeaves.map((leave) => `${leaveTypeLabel(leave.leave_type)}, ${statusLabel(leave.status)}`),
    hours,
    ...dayLessons.map(
      (lesson) => `${hhmm(lesson.starts_at)}–${hhmm(lesson.ends_at)} ${lessonLabel(lesson)}`,
    ),
    ...(isToday ? [m("calendar.gridToday")] : []),
  ].join(" — ");
}

/** Закриття в підписі: назва, а для скороченого дня ще й час. */
function closureParts(closure: ClosureRow | null, m: (key: MessageKey) => string): string[] {
  if (closure === null) return [];
  if (closure.closes_at === null) return [closure.name];
  return [`${closure.name}, ${m("calendar.from")} ${hhmm(closure.closes_at)}`];
}

/** Число дня без провідного нуля: у клітинці 3 × 3 мм зайвий символ помітний. */
function dayNumber(date: string): number {
  return Number(date.slice(8, 10));
}

/**
 * День сітки: число, яке відкриває віконечко з подробицями.
 *
 * Віконечко — нативний `<details>`, а не спливання на JavaScript: сторінка
 * серверна й має лишатися робочою без нього, а `<summary>` уже вміє те, що
 * інакше довелося б писати руками — фокус, Enter і пробіл, стан «відкрито»
 * для екранного читача.
 *
 * Відкривається тепер КОЖЕН день, а не лише позначений. Спершу клікабельними
 * були тільки закриття й відпустки: у звичайного дня календар не знав нічого
 * понад розклад. Відколи віконечко показує й години цього дня, це перестало
 * бути правдою — саме у «звичайний» день людина й питає, коли вона працює.
 * Платимо за це 365 зупинками табуляції на сторінку, і це справді багато, тож
 * кожна клітинка має власний `aria-label` з усім змістом віконечка: голосом
 * рік можна пройти, не розкриваючи жодного дня.
 */
function MarkedDay({
  date,
  label,
  cellClass,
  isToday,
  locale,
  children,
}: {
  date: string;
  label: string;
  cellClass: string;
  isToday: boolean;
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group/day relative">
      <summary
        aria-label={label}
        title={label}
        aria-current={isToday ? "date" : undefined}
        data-testid="calendar-day"
        className={cn(
          cellClass,
          isToday && TODAY_RING,
          "block cursor-pointer list-none outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          "group-open/day:ring-2 group-open/day:ring-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        {dayNumber(date)}
      </summary>

      {/*
        Над клітинкою, по центру. Ширина стала, а не `w-max`: довга назва
        закриття має переноситися, а не розтягувати віконечко за край екрана.
      */}
      <div className="absolute bottom-full left-1/2 z-20 mb-1 flex w-48 -translate-x-1/2 flex-col gap-1 rounded-md border border-border bg-popover p-2 text-left text-xs shadow-lg">
        <span className="font-medium tabular-nums">{longDate(date, locale)}</span>
        {children}
      </div>
    </details>
  );
}

/** Рядки закриття школи: назва й що саме воно означає для цього дня. */
function ClosureLines({
  closure,
  wholeDay,
  m,
}: {
  closure: ClosureRow;
  wholeDay: boolean;
  m: (key: MessageKey) => string;
}) {
  const closesAt = hhmm(closure.closes_at ?? "");

  return (
    <>
      <span>{closure.name}</span>
      <span className="text-muted-foreground">
        {wholeDay ? m("calendar.dayWholeDay") : `${m("calendar.dayEarly")} ${closesAt}.`}
      </span>
      {closure.starts_on === closure.ends_on ? null : (
        <span className="tabular-nums text-muted-foreground">
          {closure.starts_on} – {closure.ends_on}
        </span>
      )}
    </>
  );
}

/** Рядки відпусток дня: тип, статус і години — щоразу текстом. */
function LeaveLines({ dayLeaves }: { dayLeaves: readonly LeaveMark[] }) {
  return dayLeaves.map((leave, index) => (
    <span key={`${leave.on_date}-${index}`} className="flex flex-col">
      <span>{leaveTypeLabel(leave.leave_type)}</span>
      <span className="tabular-nums text-muted-foreground">
        {statusLabel(leave.status)} · {hhmm(leave.starts_at)}–{hhmm(leave.ends_at)}
      </span>
    </span>
  ));
}

/**
 * Години розкладу цього дня — те, заради чого віконечко й відкривають.
 *
 * `open` — блоки після закриття школи (`openBlocks`), `blocks` — повний
 * розклад дня. Різниця між ними й вирішує, що написати, коли годин немає:
 * «розкладу цього дня немає» (вихідний, день без блоків) — це зовсім не те
 * саме, що «школа зачинена», і людина має бачити, яка з двох причин її
 * цього дня стосується.
 */
function ScheduleLines({
  blocks,
  open,
  closed,
  m,
}: {
  blocks: readonly DayBlock[];
  open: readonly DayBlock[];
  closed: boolean;
  m: (key: MessageKey) => string;
}) {
  return (
    <span className="flex flex-col gap-0.5 border-t border-border pt-1">
      <span className="text-muted-foreground">{m("calendar.daySchedule")}</span>

      {open.length === 0 ? (
        <span>{m(noHoursKey(blocks, closed))}</span>
      ) : (
        open.map((block) => (
          <span key={`${block.positionId}-${block.starts_at}`} className="flex flex-col">
            <span className="tabular-nums">
              {hhmm(block.starts_at)}–{hhmm(block.ends_at)}
            </span>
            <span className="text-muted-foreground">{block.jobTitle}</span>
          </span>
        ))
      )}
    </span>
  );
}

/**
 * Чому годин немає: день без розкладу чи закрита школа.
 *
 * Дивимося на повний розклад дня, а не на залишок: у суботу канікул годин
 * немає тому, що субота й так вихідна, і сказати «школа зачинена» було б
 * відповіддю не на те питання.
 */
function noHoursKey(blocks: readonly DayBlock[], closed: boolean): MessageKey {
  return closed && blocks.length > 0 ? "calendar.dayClosedNoHours" : "calendar.dayNoHours";
}

/**
 * Заняття цього дня — окремим розділом під робочими годинами.
 *
 * Саме окремим, а не разом із годинами: це різні поняття, і злиті в один
 * перелік вони читалися б як одне. Години — оплачуваний час посади, з якого
 * рахується залишок відпустки; заняття — що людина в цей час робить. Коли
 * занять немає, так і написано: день без занять і день без розкладу — різні
 * відповіді.
 */
function LessonLines({
  dayLessons,
  m,
}: {
  dayLessons: readonly LessonRow[];
  m: (key: MessageKey) => string;
}) {
  return (
    <span className="flex flex-col gap-0.5 border-t border-border pt-1">
      <span className="text-muted-foreground">{m("lessons.dayLabel")}</span>

      {dayLessons.length === 0 ? (
        <span>{m("lessons.dayNone")}</span>
      ) : (
        dayLessons.map((lesson) => (
          <span key={lesson.id} className="flex flex-col">
            <span className="tabular-nums">
              {hhmm(lesson.starts_at)}–{hhmm(lesson.ends_at)}
            </span>
            <span className="font-medium">{lessonLabel(lesson)}</span>
          </span>
        ))
      )}
    </span>
  );
}
