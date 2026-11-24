import {
  closureOnDate,
  leadingBlanks,
  monthDates,
  monthLabel,
  monthsOfSchoolYear,
  type MonthKey,
} from "@/lib/leave/calendar-grid";
import type { MessageKey } from "@/lib/i18n/dict";
import type { ClosureRow } from "@/lib/leave/calendar";
import { hhmm } from "@/lib/leave/week";

/**
 * Сітка навчального року: дванадцять місяців із позначеними закритими днями.
 *
 * Окремим компонентом — із тієї самої причини, що й `ClosureList`: сторінка
 * `/calendar` має читати дані й складати блоки, а не малювати клітинки
 * (складність `CalendarPage` і так на межі, її стереже `fallow`).
 *
 * **Колір тут не несе сенсу сам по собі.** У кожної позначеної клітинки є
 * `aria-label` з назвою закриття й датою, під сіткою — підписи обох видів
 * позначок словами, а повний перелік назв і дат лишається у `ClosureList`
 * нижче. Тобто людина, яка не розрізняє кольорів, нічого не втрачає.
 */
export function CalendarYearGrid({
  closures,
  year,
  locale,
  m,
}: {
  closures: readonly ClosureRow[];
  year: number;
  locale: string;
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
            fromLabel={m("calendar.from")}
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
  fromLabel,
}: {
  monthKey: MonthKey;
  closures: readonly ClosureRow[];
  locale: string;
  weekdays: readonly string[];
  fromLabel: string;
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
            fromLabel={fromLabel}
          />
        ))}
      </div>
    </section>
  );
}

function DayCell({
  date,
  closure,
  fromLabel,
}: {
  date: string;
  closure: ClosureRow | null;
  fromLabel: string;
}) {
  const day = Number(date.slice(8, 10));

  if (!closure) {
    return (
      <span className="rounded-sm py-1 tabular-nums text-muted-foreground">{day}</span>
    );
  }

  // Те саме, що `isWholeDayClosure`, але без перекладання рядка бази в інший
  // тип заради одного порівняння: порожній час закриття = закрито цілу добу.
  const wholeDay = closure.closes_at === null;

  // Назва закриття — в `aria-label` і в `title`: екранний читач промовляє її,
  // а миша показує підказку. Сам колір нічого не повідомляє (див. легенду).
  const name = wholeDay
    ? `${date} — ${closure.name}`
    : `${date} — ${closure.name}, ${fromLabel} ${hhmm(closure.closes_at ?? "")}`;

  return (
    <span
      aria-label={name}
      title={name}
      data-testid="calendar-day-closed"
      className={wholeDay ? CLOSED_CELL : EARLY_CELL}
    >
      {day}
    </span>
  );
}
