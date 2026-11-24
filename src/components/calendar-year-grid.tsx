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
import { hhmm } from "@/lib/leave/week";

/**
 * Сітка навчального року: дванадцять місяців із позначеними закритими днями.
 *
 * Окремим компонентом — із тієї самої причини, що й `ClosureList`: сторінка
 * `/calendar` має читати дані й складати блоки, а не малювати клітинки
 * (складність `CalendarPage` і так на межі, її стереже `fallow`).
 *
 * **Колір тут не несе сенсу сам по собі.** У кожної позначеної клітинки є
 * `aria-label` з назвою закриття й датою, натискання відкриває віконечко з
 * тим самим текстом, під сіткою — підписи обох видів позначок словами, а
 * повний перелік назв і дат лишається у `ClosureList` нижче.
 */
export function CalendarYearGrid({
  closures,
  year,
  locale,
  today,
  m,
}: {
  closures: readonly ClosureRow[];
  year: number;
  locale: string;
  /** Сьогоднішня дата за Києвом — приходить із сервера, не з браузера. */
  today: string;
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
            m={m}
          />
        ))}
      </div>

      {/*
        Легенда: обидва види позначок названо словами, а не лише кольором.
        Зразок — така сама клітинка з числом, як у сітці: інакше людина не
        впізнає в кольоровому квадратику те, що бачить у місяці (перша версія
        мала абстрактні квадратики — і перше ж питання було «що це?»).
      */}
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={`${TODAY_RING} w-7 rounded-sm py-1 text-center tabular-nums`}>
            24
          </span>
          {m("calendar.gridToday")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={`${CLOSED_CELL} w-7 text-center`}>
            28
          </span>
          {m("calendar.gridWholeDay")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={`${EARLY_CELL} w-7 text-center`}>
            20
          </span>
          {m("calendar.gridEarly")}
        </li>
      </ul>
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
 * Сьогодні — кільце, а не заливка: заливкою вже позначені закриття, і якби
 * сьогоднішній день теж заливався, два різні повідомлення злилися б в одне.
 * Кільце лягає поверх будь-якої клітинки, зокрема закритої.
 */
const TODAY_RING = "ring-2 ring-primary";

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
  m,
}: {
  monthKey: MonthKey;
  closures: readonly ClosureRow[];
  locale: string;
  weekdays: readonly string[];
  today: string;
  m: (key: MessageKey) => string;
}) {
  const dates = monthDates(monthKey);
  const blanks = leadingBlanks(monthKey);

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

        {Array.from({ length: blanks }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}

        {dates.map((date) => (
          <DayCell
            key={date}
            date={date}
            closure={closureOnDate(closures, date)}
            locale={locale}
            isToday={date === today}
            m={m}
          />
        ))}
      </div>
    </section>
  );
}

function DayCell({
  date,
  closure,
  locale,
  isToday,
  m,
}: {
  date: string;
  closure: ClosureRow | null;
  locale: string;
  isToday: boolean;
  m: (key: MessageKey) => string;
}) {
  if (closure) {
    return (
      <ClosedDayCell date={date} closure={closure} locale={locale} isToday={isToday} m={m} />
    );
  }

  return (
    <span
      aria-current={isToday ? "date" : undefined}
      className={cn(
        "rounded-sm py-1 tabular-nums text-muted-foreground",
        isToday && `${TODAY_RING} font-medium text-foreground`,
      )}
    >
      {Number(date.slice(8, 10))}
    </span>
  );
}

/**
 * Закритий день: число, яке відкриває віконечко з подробицями.
 *
 * Віконечко — нативний `<details>`, а не спливання на JavaScript: сторінка
 * серверна й має лишатися робочою без нього, а `<summary>` уже вміє те, що
 * інакше довелося б писати руками — фокус, Enter і пробіл, стан «відкрито»
 * для екранного читача.
 *
 * Клікабельні лише позначені дні: у вільного дня календар не знає нічого,
 * крім «не закрито», а 365 інтерактивних клітинок зробили б прохід
 * клавіатурою по сторінці нестерпним.
 */
function ClosedDayCell({
  date,
  closure,
  locale,
  isToday,
  m,
}: {
  date: string;
  closure: ClosureRow;
  locale: string;
  isToday: boolean;
  m: (key: MessageKey) => string;
}) {
  const wholeDay = closure.closes_at === null;
  const closesAt = hhmm(closure.closes_at ?? "");
  const kind = wholeDay
    ? m("calendar.dayWholeDay")
    : `${m("calendar.dayEarly")} ${closesAt}.`;

  // Назва доступна трьома шляхами — підказка миші, екранний читач і саме
  // віконечко, — і жоден із них не є кольором.
  const label =
    `${date} — ${closure.name}` +
    (wholeDay ? "" : `, ${m("calendar.from")} ${closesAt}`) +
    (isToday ? ` (${m("calendar.gridToday")})` : "");

  return (
    <details className="group/day relative">
      <summary
        aria-label={label}
        title={label}
        aria-current={isToday ? "date" : undefined}
        data-testid="calendar-day-closed"
        className={cn(
          wholeDay ? CLOSED_CELL : EARLY_CELL,
          isToday && TODAY_RING,
          "block cursor-pointer list-none outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          "group-open/day:ring-2 group-open/day:ring-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        {Number(date.slice(8, 10))}
      </summary>

      {/*
        Над клітинкою, по центру. Ширина стала, а не `w-max`: довга назва
        закриття має переноситися, а не розтягувати віконечко за край екрана.
      */}
      <div
        data-testid="calendar-day-popover"
        className="absolute bottom-full left-1/2 z-20 mb-1 flex w-44 -translate-x-1/2 flex-col gap-1 rounded-md border border-border bg-popover p-2 text-left text-xs shadow-lg"
      >
        <span className="font-medium tabular-nums">{longDate(date, locale)}</span>
        <span>{closure.name}</span>
        <span className="text-muted-foreground">{kind}</span>
        {closure.starts_on === closure.ends_on ? null : (
          <span className="tabular-nums text-muted-foreground">
            {closure.starts_on} – {closure.ends_on}
          </span>
        )}
      </div>
    </details>
  );
}
