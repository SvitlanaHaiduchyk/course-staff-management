/**
 * Побудова записів заявки з введення працівника.
 *
 * Вимоги: requirements/01-leave-request.md (знімок 2026-10-20),
 * специфікація: openspec/specs/leave-request/spec.md.
 *
 * Заявка зберігається цілком: або всі її записи створено, або жодного
 * (припущення PM, AC-LEAVE-16). Тому функція повертає або повний набір
 * записів, або одну відмову — часткового результату не буває.
 */

import {
  type ScheduleBlock,
  type TimeRange,
  scheduleFor,
  wholeDayRange,
} from "./schedule";
import { NO_WORKING_HOURS, validateHours } from "./validate";

export type LeaveType = "sick" | "personal" | "unpaid" | "family_celebration";

/** Посада працівника з її розкладом на тиждень. */
export type Position = {
  readonly id: string;
  readonly blocks: readonly ScheduleBlock[];
};

/** Вибір працівника для однієї посади на одну дату. */
export type PositionChoice = {
  readonly positionId: string;
  /** Виключену посаду запис не створює (AC-LEAVE-03). */
  readonly included: boolean;
  /** Цілий день — усі блоки розкладу посади на цю дату (припущення PM). */
  readonly wholeDay: boolean;
  /** Години, якщо не цілий день (AC-LEAVE-04). */
  readonly hours?: TimeRange;
};

export type DateChoice = {
  readonly date: string;
  readonly positions: readonly PositionChoice[];
};

export type RequestInput = {
  readonly leaveType: LeaveType;
  /** Ступінь спорідненості — лише для «Family celebration» (AC-LEAVE-12). */
  readonly relationship?: string | null;
  /** Необов'язковий коментар до 500 символів (AC-LEAVE-17, AC-LEAVE-18). */
  readonly comment?: string | null;
  readonly dates: readonly DateChoice[];
};

/** Запис, готовий до вставки: одна посада на одну дату. */
export type DraftRecord = {
  readonly positionId: string;
  readonly date: string;
  readonly startsAt: string;
  readonly endsAt: string;
};

/** Дата, яку відхилено, але яка не скасувала решти заявки (AC-LEAVE-21). */
export type SkippedDate = {
  readonly date: string;
  readonly message: string;
};

export type BuildResult =
  | {
      readonly ok: true;
      readonly records: readonly DraftRecord[];
      /** Дати без робочих годин: працівник бачить по повідомленню на кожну. */
      readonly skipped: readonly SkippedDate[];
    }
  | { readonly ok: false; readonly message: string };

/** AC-LEAVE-10: на дату не включено жодної посади. */
export const CHOOSE_AT_LEAST_ONE_POSITION = "Choose at least one position";

/** AC-LEAVE-12: «Family celebration» без ступеня спорідненості. */
export const RELATIONSHIP_REQUIRED =
  "State your relationship to this person: sibling, child, parent, grandchild or grandparent. " +
  "Not applicable to cousins, friends, neighbours or siblings-in-law";

/** AC-LEAVE-18: коментар довший за 500 символів. */
export const COMMENT_TOO_LONG = "The comment can be at most 500 characters";

/** Максимальна довжина коментаря заявки (припущення PM, знімок 2026-10-20). */
export const COMMENT_MAX_LENGTH = 500;

function fail(message: string): BuildResult {
  return { ok: false, message };
}

/**
 * Будує записи заявки або повертає першу відмову.
 *
 * Порядок перевірок відповідає порядку кроків основного сценарію вимоги:
 * спершу поля самої заявки (тип, спорідненість, коментар), потім кожна дата
 * й кожна включена посада.
 */
export function buildRecords(input: RequestInput, positions: readonly Position[]): BuildResult {
  // AC-LEAVE-12: ступінь спорідненості обов'язковий саме для «Family celebration».
  if (input.leaveType === "family_celebration" && !input.relationship?.trim()) {
    return fail(RELATIONSHIP_REQUIRED);
  }

  // AC-LEAVE-18: межа коментаря — 500 символів.
  if (input.comment != null && input.comment.length > COMMENT_MAX_LENGTH) {
    return fail(COMMENT_TOO_LONG);
  }

  const byId = new Map(positions.map((p) => [p.id, p]));
  const records: DraftRecord[] = [];
  const skipped: SkippedDate[] = [];

  for (const day of input.dates) {
    const included = day.positions.filter((p) => p.included);

    // AC-LEAVE-10: жодної включеної посади на цю дату.
    if (included.length === 0) return fail(CHOOSE_AT_LEAST_ONE_POSITION);

    const planned = included.map((choice) => {
      const position = byId.get(choice.positionId);
      if (!position) {
        throw new TypeError(`Невідома посада "${choice.positionId}" у заявці`);
      }
      return { choice, position, blocks: scheduleFor(position.blocks, day.date) };
    });

    // AC-LEAVE-21: дата без робочих годин лише відпадає, решта дат заявки лишаються
    // (припущення PM, знімок 2026-10-21). «Усе або нічого» діє на прийняті дати.
    if (planned.every((p) => p.blocks.length === 0)) {
      skipped.push({ date: day.date, message: NO_WORKING_HOURS });
      continue;
    }

    for (const { choice, position, blocks } of planned) {
      // AC-LEAVE-01, AC-LEAVE-02: «цілий день» — усі блоки розкладу посади на цю дату.
      const range = choice.wholeDay ? wholeDayRange(blocks) : (choice.hours ?? null);

      const check = validateHours(blocks, range ?? { startsAt: "00:00", endsAt: "00:01" });
      if (!check.ok) return fail(check.message);
      if (!range) return fail(CHOOSE_AT_LEAST_ONE_POSITION);

      records.push({
        positionId: position.id,
        date: day.date,
        startsAt: range.startsAt,
        endsAt: range.endsAt,
      });
    }
  }

  // AC-LEAVE-06: не лишилось жодної прийнятої дати — заявки немає.
  if (records.length === 0) return fail(NO_WORKING_HOURS);

  return { ok: true, records, skipped };
}
