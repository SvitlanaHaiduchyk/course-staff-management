import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MessageKey } from "@/lib/i18n/dict";

/** Посада, у якій відбувається заняття: лише те, чим її підписати у виборі. */
export type LessonPosition = {
  readonly id: string;
  readonly job_title: string;
};

/**
 * Форма додавання заняття.
 *
 * Окремим компонентом, щоб сторінка лишалася сторінкою — як `ClosureForm`.
 *
 * Нативні `<select>`, а не `Select` з `@/components/ui`: той побудований на
 * `@base-ui/react` і клієнтський, а форма тут серверна (`form action`), і дія
 * читає `formData`. Те саме рішення й з тієї ж причини вже прийнято для
 * чекбоксів посад у формі заявки. Кольори — семантичні токени, `check:design`
 * проходить.
 */
export function LessonForm({
  action,
  positions,
  dayNames,
  m,
}: {
  action: (formData: FormData) => void | Promise<void>;
  positions: readonly LessonPosition[];
  /** Назви днів тижня з індексу 1 (понеділок), як `weekday` у базі. */
  dayNames: readonly string[];
  m: (key: MessageKey) => string;
}) {
  const field =
    "h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground " +
    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <form action={action} className="flex flex-col gap-6">
      {/*
        Вибір посади показуємо завжди, навіть коли посада одна: сховане поле
        з єдиним значенням виглядає так само, але людина з двома посадами
        побачила б форму без вибору лише тому, що вчора посада була одна.
      */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="lesson-position">{m("lessons.position")}</Label>
        <select id="lesson-position" name="positionId" required className={field}>
          {positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.job_title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lesson-weekday">{m("lessons.weekday")}</Label>
        <select id="lesson-weekday" name="weekday" required defaultValue="1" className={field}>
          {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
            <option key={weekday} value={weekday}>
              {dayNames[weekday]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lesson-starts">{m("lessons.startsAt")}</Label>
          <Input id="lesson-starts" name="startsAt" type="time" required className="w-32" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lesson-ends">{m("lessons.endsAt")}</Label>
          <Input id="lesson-ends" name="endsAt" type="time" required className="w-32" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lesson-subject">{m("lessons.subject")}</Label>
        {/*
          maxLength не ставимо з тієї ж причини, що й у формі закриття: поле,
          яке мовчки обрізає ввід, не покаже повідомлення про задовгу назву.
          Межу тримають `parseLessonInput` і обмеження `lessons_subject_check`.
        */}
        <Input id="lesson-subject" name="subject" required />
        <p className="text-xs text-muted-foreground">{m("lessons.subjectHint")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lesson-form">{m("lessons.form")}</Label>
        <Input id="lesson-form" name="form" className="w-40" />
        <p className="text-xs text-muted-foreground">{m("lessons.formHint")}</p>
      </div>

      <Button type="submit" className="self-start">
        {m("lessons.add")}
      </Button>
    </form>
  );
}
