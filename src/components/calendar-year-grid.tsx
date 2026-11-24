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
import { worksOn, type LeaveMark } from "@/lib/leave/calendar-overlay";
import { statusLabel } from "@/lib/leave/decision";
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
 */
export function CalendarYearGrid({
  closures,
  year,
  locale,
  today,
  workingDays,
  leaves,
  m,
}: {
  closures: readonly ClosureRow[];
  year: number;
  locale: string;
  /** Сьогоднішня дата за Києвом — приходить із сервера, не з браузера. */
  today: string;
  /** Дні тижня, коли людина працює (1 — понеділок … 7 — неділя). */
  workingDays: ReadonlySet<number>;
  /** Власні відпустки за датами; на одну дату може бути кілька — по посаді. */
  leaves: ReadonlyMap<string, readonly LeaveMark[]>;
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
            workingDays={workingDays}
            leaves={leaves}
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
  workingDays,
  leaves,
  m,
}: {
  monthKey: MonthKey;
  closures: readonly ClosureRow[];
  locale: string;
  weekdays: readonly string[];
  today: string;
  workingDays: ReadonlySet<number>;
  leaves: ReadonlyMap<string, readonly LeaveMark[]>;
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
            locale={locale}
            isToday={date === today}
            isWorking={worksOn(workingDays, date)}
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
  locale: string;
  isToday: boolean;
  isWorking: boolean;
  m: (key: MessageKey) => string;
};

/**
 * Клітинка дня: лише вибір шару.
 *
 * Порядок саме такий: закриття школи важливіше за власну відпустку (воно
 * стосується всіх і скасовує робочий день), а відпустка важливіша за «просто
 * робочий день». Коли на дату припало і закриття, і відпустка, віконечко
 * показує обидва рядки.
 */
function DayCell(props: DayProps) {
  if (props.closure) return <ClosedDay {...props} closure={props.closure} />;
  if (props.dayLeaves.length > 0) return <LeaveDay {...props} />;

  return (
    <span
      aria-current={props.isToday ? "date" : undefined}
      className={cn(props.isWorking ? WORK_CELL : OFF_CELL, props.isToday && TODAY_RING)}
    >
      {dayNumber(props.date)}
    </span>
  );
}

/** Число дня без провідного нуля: у клітинці 3 × 3 мм зайвий символ помітний. */
function dayNumber(date: string): number {
  return Number(date.slice(8, 10));
}

/**
 * Позначений день: число, яке відкриває віконечко з подробицями.
 *
 * Віконечко — нативний `<details>`, а не спливання на JavaScript: сторінка
 * серверна й має лишатися робочою без нього, а `<summary>` уже вміє те, що
 * інакше довелося б писати руками — фокус, Enter і пробіл, стан «відкрито»
 * для екранного читача.
 *
 * Клікабельні лише позначені дні: у звичайного робочого дня календар не знає
 * нічого понад розклад, який є на `/schedule`, а 365 інтерактивних клітинок
 * зробили б прохід клавіатурою по сторінці нестерпним.
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
        data-testid="calendar-day-marked"
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

function ClosedDay({ date, closure, dayLeaves, locale, isToday, m }: DayProps & { closure: ClosureRow }) {
  const wholeDay = closure.closes_at === null;
  const closesAt = hhmm(closure.closes_at ?? "");
  const label =
    `${date} — ${closure.name}` +
    (wholeDay ? "" : `, ${m("calendar.from")} ${closesAt}`) +
    (isToday ? ` (${m("calendar.gridToday")})` : "");

  return (
    <MarkedDay
      date={date}
      label={label}
      cellClass={wholeDay ? CLOSED_CELL : EARLY_CELL}
      isToday={isToday}
      locale={locale}
    >
      <span>{closure.name}</span>
      <span className="text-muted-foreground">
        {wholeDay ? m("calendar.dayWholeDay") : `${m("calendar.dayEarly")} ${closesAt}.`}
      </span>
      {closure.starts_on === closure.ends_on ? null : (
        <span className="tabular-nums text-muted-foreground">
          {closure.starts_on} – {closure.ends_on}
        </span>
      )}
      <LeaveLines dayLeaves={dayLeaves} />
    </MarkedDay>
  );
}

function LeaveDay({ date, dayLeaves, locale, isToday, m }: DayProps) {
  // Тип і статус — текстом, дослівно як у решті порталу (вимога PM, …spec#14).
  const first = dayLeaves[0];
  const label =
    `${date} — ${leaveTypeLabel(first.leave_type)}, ${statusLabel(first.status)}` +
    (isToday ? ` (${m("calendar.gridToday")})` : "");

  return (
    <MarkedDay
      date={date}
      label={label}
      cellClass={leaveCellClass(first.status)}
      isToday={isToday}
      locale={locale}
    >
      <LeaveLines dayLeaves={dayLeaves} />
    </MarkedDay>
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
