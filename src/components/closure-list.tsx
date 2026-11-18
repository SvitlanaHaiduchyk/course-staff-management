import {
  closureDatesLabel,
  noClosuresMessage,
  type ClosureRow,
} from "@/lib/leave/calendar";

/**
 * Перелік закриттів навчального року або порожній стан.
 *
 * Окремим компонентом, щоб сторінка `/calendar` лишалася сторінкою — читає
 * дані й складає блоки, а не малює рядки. Ворота `fallow` ловлять саме це:
 * складність `CalendarPage` виходила в band «high» (те саме вже траплялося з
 * `Home` і `ScheduleCard`).
 */
export function ClosureList({
  closures,
  year,
  fromLabel,
}: {
  closures: readonly ClosureRow[];
  year: number;
  fromLabel: string;
}) {
  if (closures.length === 0) {
    // AC-CAL-15: дослівний текст PM, англійською в обох мовах інтерфейсу.
    return (
      <p data-testid="calendar-empty" className="text-sm text-muted-foreground">
        {noClosuresMessage(year)}
      </p>
    );
  }

  return (
    <ul data-testid="calendar-list" className="flex flex-col gap-2">
      {closures.map((c) => (
        <li
          key={c.id}
          className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border pb-2 last:border-b-0"
        >
          {/* Назва й дати — текстом; кольорових позначок виду закриття немає. */}
          <span className="text-sm">{c.name}</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {closureDatesLabel(c, fromLabel)}
          </span>
        </li>
      ))}
    </ul>
  );
}
