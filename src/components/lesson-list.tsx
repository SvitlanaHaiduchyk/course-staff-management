import { Button } from "@/components/ui/button";
import type { MessageKey } from "@/lib/i18n/dict";
import { lessonLabel, type LessonRow } from "@/lib/leave/lessons";
import { hhmm } from "@/lib/leave/week";

/**
 * Власні заняття з кнопкою «Прибрати», згруповані за днем тижня.
 *
 * Групуємо саме за днем: заняття задано днем тижня, а не датою, і плаский
 * перелік із 30 рядків відповідає на питання «що в мене взагалі є», тоді як
 * людина питає «що в мене у вівторок».
 *
 * Порядок приносить запит (`weekday`, потім `starts_at`), тож тут лише показ.
 */
export function LessonList({
  lessons,
  positionTitles,
  dayNames,
  action,
  m,
}: {
  lessons: readonly LessonRow[];
  /** Підпис посади за її id: «Elementary school / Teacher». */
  positionTitles: ReadonlyMap<string, string>;
  dayNames: readonly string[];
  action: (formData: FormData) => void | Promise<void>;
  m: (key: MessageKey) => string;
}) {
  if (lessons.length === 0) {
    return <p className="text-sm text-muted-foreground">{m("lessons.none")}</p>;
  }

  const weekdays = [...new Set(lessons.map((lesson) => lesson.weekday))].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4">
      {weekdays.map((weekday) => (
        <section key={weekday} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{dayNames[weekday]}</h3>

          <ul className="flex flex-col gap-2">
            {lessons
              .filter((lesson) => lesson.weekday === weekday)
              .map((lesson) => (
                <li
                  key={lesson.id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-2 last:border-b-0"
                >
                  <span className="text-sm tabular-nums">
                    {hhmm(lesson.starts_at)}–{hhmm(lesson.ends_at)}
                  </span>
                  <span className="text-sm">{lessonLabel(lesson)}</span>
                  <span className="text-xs text-muted-foreground">
                    {positionTitles.get(lesson.position_id) ?? "—"}
                  </span>
                  <form action={action}>
                    <input type="hidden" name="id" value={lesson.id} />
                    <Button type="submit" variant="outline" size="sm">
                      {m("lessons.remove")}
                    </Button>
                  </form>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
