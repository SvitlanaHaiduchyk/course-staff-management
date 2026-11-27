/**
 * Заняття посади: уроки, наради — те, що відбувається ВСЕРЕДИНІ робочих годин.
 *
 * Вимог PM на це немає; рішення й межі — `docs/decisions/0004-lessons-as-a-layer.md`,
 * питання до PM — `docs/spec-reading.md` (2026-11-27). Головне, що тримає цей
 * модуль: заняття — шар показу. Жодна функція балансу його не читає, жоден AC
 * на нього не спирається, і хвилини заняття ніде не стають робочими хвилинами
 * (знаменник балансу рахують `schedule_blocks`: AC-LEAVE-01, AC-LEAVE-15).
 *
 * Модуль чистий — жодних запитів і жодного React: сторінка приносить рядки,
 * тут лише перетворення й розбір форми, які перевіряє тест.
 */

import type { MessageKey } from "@/lib/i18n/dict";

import { minutesOfTime, weekdayOf } from "./week";

/** Заняття так, як його віддає база. */
export type LessonRow = {
  readonly id: string;
  readonly position_id: string;
  readonly weekday: number;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly subject: string;
  /** Клас: «4-A». `null` — заняття без класу (нарада, чергування). */
  readonly form: string | null;
};

/** Заняття цієї дати, у порядку часу. Порожній масив — занять цього дня немає. */
export function lessonsOn(lessons: readonly LessonRow[], date: string): LessonRow[] {
  const weekday = weekdayOf(date);
  return lessons
    .filter((lesson) => lesson.weekday === weekday)
    .sort((a, b) => minutesOfTime(a.starts_at) - minutesOfTime(b.starts_at));
}

/**
 * Підпис заняття: «Maths, 4-A» або просто «Maths».
 *
 * Клас через кому, а не в дужках: у дужках він читається як примітка, а для
 * вчителя це половина відповіді на питання «куди мені зараз іти».
 */
export function lessonLabel(lesson: Pick<LessonRow, "subject" | "form">): string {
  const form = lesson.form?.trim();
  return form ? `${lesson.subject}, ${form}` : lesson.subject;
}

/** Посада так, як її віддає `loadMyPositions`: назва й підрозділ. */
export type LabelledPosition = {
  readonly id: string;
  readonly job_title: string;
  readonly divisions?: { readonly name: string } | null;
};

/**
 * Підпис посади: «Elementary school / Teacher».
 *
 * Запис саме через « / » і саме в такому порядку — так посаду пише сам PM в
 * AC-LEAVE-01 і AC-LEAVE-02 («main position "Elementary school / Teacher"»),
 * і так її вже показує форма заявки. Свій роздільник тут означав би, що та
 * сама посада в порталі виглядає двома різними способами.
 *
 * Підрозділ ПЕРШИМ: людина з двома посадами питає насамперед «де я зараз»,
 * а вже потім «ким». У глосарії PM це Division — «the part of the school a
 * position belongs to»; словом «school» PM називає всю установу, тож
 * підрозділ школою не називаємо (`requirements/product.md`, глосарій).
 *
 * Підрозділу може не бути лише в даних, яких ми не бачили: `division_id` у
 * базі `not null`. Тоді лишається сама назва посади — краще, ніж «— · Teacher».
 */
export function positionLabel(position: LabelledPosition): string {
  const division = position.divisions?.name?.trim();
  return division ? `${division} / ${position.job_title}` : position.job_title;
}

/** Ті самі підписи мапою: заняття знає лише `position_id`. */
export function positionLabels(
  positions: readonly LabelledPosition[],
): ReadonlyMap<string, string> {
  return new Map(positions.map((position) => [position.id, positionLabel(position)]));
}

/**
 * Підпис посади разом із працівником: «Teacher One — Elementary school / Teacher».
 *
 * Потрібен лише адміністраторові: він веде заняття всіх посад школи, і без
 * імені власника два «Elementary school / Teacher» у списку не розрізнити.
 * Працівникові його не показуємо — він і так дивиться на свої.
 *
 * Тире, а не дужки: у дужках ім'я читається як примітка, хоча тут воно —
 * перше, за чим шукають рядок.
 */
export function ownedPositionLabel(
  owner: string | null | undefined,
  position: LabelledPosition,
): string {
  const name = owner?.trim();
  return name ? `${name} — ${positionLabel(position)}` : positionLabel(position);
}

/** Поля форми заняття, як їх віддає `FormData`. */
export type LessonFields = {
  readonly positionId: string;
  readonly weekday: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly subject: string;
  readonly form: string;
};

/** Рядок для вставки в `public.lessons`. */
export type LessonInput = {
  readonly position_id: string;
  readonly weekday: number;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly subject: string;
  readonly form: string | null;
};

/**
 * Помилку повертаємо КЛЮЧЕМ словника, а не текстом.
 *
 * `parseClosureInput` поруч повертає рядки — але там це дослівні тексти PM,
 * які мають лишатися англійськими в обох мовах. Тут таких текстів немає
 * (вимоги PM про заняття мовчать), тож повідомлення — звичайний інтерфейс і
 * має бути мовою сторінки. Модуль про мову не знає, тож віддає ключ.
 */
export type LessonInputResult =
  | { readonly ok: true; readonly input: LessonInput }
  | { readonly ok: false; readonly messageKey: MessageKey };

/** Довжини — ті самі, що в обмеженнях `lessons` у базі. */
const SUBJECT_MAX = 100;
const FORM_MAX = 20;

export function parseLessonInput(fields: LessonFields): LessonInputResult {
  const subject = fields.subject.trim();
  const form = fields.form.trim();
  const weekday = Number(fields.weekday);
  const startsAt = fields.startsAt.trim();
  const endsAt = fields.endsAt.trim();

  if (fields.positionId.trim() === "") return fail("lessons.errPosition");
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return fail("lessons.errWeekday");
  if (subject === "" || subject.length > SUBJECT_MAX) return fail("lessons.errSubject");
  if (form.length > FORM_MAX) return fail("lessons.errForm");
  if (startsAt === "" || endsAt === "") return fail("lessons.errTime");

  // Кінець строго пізніший за початок — як `lessons_order_check` у базі.
  // Межу тримаємо з того ж боку, що й обмеження: заняття нульової тривалості
  // не буває, а заняття «до 09:00» не включає 09:00.
  if (minutesOfTime(endsAt) <= minutesOfTime(startsAt)) return fail("lessons.errOrder");

  return {
    ok: true,
    input: {
      position_id: fields.positionId,
      weekday,
      starts_at: startsAt,
      ends_at: endsAt,
      subject,
      form: form === "" ? null : form,
    },
  };
}

function fail(messageKey: MessageKey): LessonInputResult {
  return { ok: false, messageKey };
}
