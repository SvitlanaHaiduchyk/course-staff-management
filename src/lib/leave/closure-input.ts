/**
 * Розбір форми закриття: що саме піде в `public.add_school_closure`.
 *
 * Вимоги: requirements/04-school-calendar.md (знімок 2026-11-18),
 * план: openspec/changes/impl-school-calendar/design.md.
 *
 * Окремою чистою функцією, бо тут живуть дві речі, які інакше неможливо
 * перевірити тестом: перетворення «скорочений день → одна дата» і два тексти
 * PM, яких база не побачить (вона приймає `date`, і порожній рядок до неї не
 * доїде). Решту правил — назву, порядок дат, перетини, блокувальні записи —
 * перевіряє сама база, і дублювати їх тут не можна: два джерела правди рано
 * чи пізно розійдуться.
 */

/** Поля форми, як їх віддає `FormData`. */
export type ClosureFields = {
  readonly name: string;
  readonly kind: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly closesAt: string;
};

/** Аргументи `add_school_closure`. */
export type ClosureInput = {
  readonly p_name: string;
  readonly p_starts_on: string;
  readonly p_ends_on: string;
  readonly p_closes_at: string | null;
};

export type ClosureInputResult =
  | { readonly ok: true; readonly input: ClosureInput }
  | { readonly ok: false; readonly message: string };

/** Припущення PM; власного AC не має. */
export const DATES_REQUIRED = "Enter the start and end dates";
/** Припущення PM; власного AC не має. */
export const CLOSING_TIME_REQUIRED = "Enter the closing time";

export function parseClosureInput(fields: ClosureFields): ClosureInputResult {
  const early = fields.kind === "early";
  const startsOn = fields.startsOn.trim();
  const closesAt = fields.closesAt.trim();

  // Скорочений день — завжди одна дата, тож кінцем для нього є його ж початок.
  // Те саме тримає обмеження school_closures_single_day_check у базі.
  const endsOn = early ? startsOn : fields.endsOn.trim();

  if (startsOn === "" || endsOn === "") {
    return { ok: false, message: DATES_REQUIRED };
  }

  if (early && closesAt === "") {
    // Без часу закриття база прийняла б рядок як закриття на цілий день —
    // мовчки не те, що просив адміністратор.
    return { ok: false, message: CLOSING_TIME_REQUIRED };
  }

  return {
    ok: true,
    input: {
      // Назву передаємо як є: межі перевіряє база (AC-CAL-18, AC-CAL-19), а
      // обрізати її тут означало б вирішити за PM, що таке «порожня назва».
      p_name: fields.name,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
      p_closes_at: early ? closesAt : null,
    },
  };
}
