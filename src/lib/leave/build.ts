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
import { type Closure, blocksAfterClosure, closedFrom, closureOn } from "./closure";
import { NO_WORKING_HOURS, validateClosedDate, validateHours } from "./validate";

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
/**
 * `closures` — обов'язковий аргумент, а не значення за замовчуванням.
 *
 * Та сама причина, що й у `validateClosedDate`: виклик без закриттів мовчки
 * повернув би поведінку до шкільного календаря, і дата в канікули знову
 * створювала б записи. Тип тепер цього не дозволяє — порожній список треба
 * передати явно.
 */
/** Що робити з однією датою заявки. */
type DayOutcome =
  | { readonly kind: "records"; readonly records: readonly DraftRecord[] }
  | { readonly kind: "skip"; readonly message: string }
  | { readonly kind: "fail"; readonly message: string };

/** Посада з її розкладом на дату: до закриття й після нього. */
type PlannedPosition = {
  readonly choice: PositionChoice;
  readonly position: Position;
  /** Розклад посади на цю дату, яким він є в її графіку. */
  readonly onDate: readonly ScheduleBlock[];
  /** Те саме після шкільного календаря (AC-CAL-04). */
  readonly blocks: readonly ScheduleBlock[];
};

function planPositions(
  day: DateChoice,
  byId: ReadonlyMap<string, Position>,
  closure: Closure | null,
): PlannedPosition[] {
  return day.positions
    .filter((p) => p.included)
    .map((choice) => {
      const position = byId.get(choice.positionId);
      if (!position) {
        throw new TypeError(`Невідома посада "${choice.positionId}" у заявці`);
      }
      // AC-CAL-04, AC-CAL-05: далі працюємо з ОБРІЗАНИМ розкладом — «цілий
      // день» закінчується часом закриття, а години після нього не проходять
      // перевірку, бо таких блоків уже немає.
      const onDate = scheduleFor(position.blocks, day.date);
      return { choice, position, onDate, blocks: blocksAfterClosure(onDate, closedFrom(closure)) };
    });
}

/** Записи однієї посади на дату — або причина, чому їх немає. */
function recordsFor(planned: PlannedPosition, date: string, closure: Closure | null): DayOutcome {
  const { choice, position, onDate, blocks } = planned;

  // Посада, якій закриття забрало ВЕСЬ розклад цієї дати, просто не дає
  // запису: на скороченому дні так буває з кожною післяобідньою посадою
  // (AC-CAL-04). Без цієї гілки одна така посада валила б усю заявку
  // повідомленням «You have no working hours on this day», хоч інша посада
  // цього дня працює.
  //
  // Умова саме складена: `onDate.length > 0` означає, що розклад був і його
  // прибрало закриття. Посада, яка цього дня не працює й без календаря,
  // лишається зі старою поведінкою зрізу 1.
  if (blocks.length === 0 && closure !== null && onDate.length > 0) {
    return { kind: "records", records: [] };
  }

  // AC-LEAVE-01, AC-LEAVE-02: «цілий день» — усі блоки розкладу посади на цю дату.
  const range = choice.wholeDay ? wholeDayRange(blocks) : (choice.hours ?? null);

  const check = validateHours(blocks, range ?? { startsAt: "00:00", endsAt: "00:01" });
  if (!check.ok) return { kind: "fail", message: check.message };
  if (!range) return { kind: "fail", message: CHOOSE_AT_LEAST_ONE_POSITION };

  return {
    kind: "records",
    records: [{ positionId: position.id, date, startsAt: range.startsAt, endsAt: range.endsAt }],
  };
}

/** Одна дата заявки: її записи, її відмова або причина відпасти. */
function planDay(day: DateChoice, byId: ReadonlyMap<string, Position>, closures: readonly Closure[]): DayOutcome {
  const closure = closureOn(closures, day.date);
  const planned = planPositions(day, byId, closure);

  // AC-LEAVE-10: жодної включеної посади на цю дату.
  if (planned.length === 0) return { kind: "fail", message: CHOOSE_AT_LEAST_ONE_POSITION };

  // AC-CAL-03, AC-CAL-16: закрита дата відпадає зі своїм повідомленням — і
  // саме ПЕРЕД перевіркою порожнього розкладу. Інакше скорочений день, що
  // забрав усі блоки, показував би «You have no working hours on this day»
  // замість назви закриття, і ми б знову помилилися так само, як до відповіді
  // PM на `…spec#22`.
  const closed = validateClosedDate(
    closure,
    planned.flatMap((p) => p.blocks),
  );
  if (!closed.ok) return { kind: "skip", message: closed.message };

  // AC-LEAVE-21: дата без робочих годин лише відпадає, решта дат заявки
  // лишаються (припущення PM, знімок 2026-10-21). «Усе або нічого» діє на
  // прийняті дати.
  if (planned.every((p) => p.blocks.length === 0)) return { kind: "skip", message: NO_WORKING_HOURS };

  const records: DraftRecord[] = [];
  for (const one of planned) {
    const outcome = recordsFor(one, day.date, closure);
    if (outcome.kind !== "records") return outcome;
    records.push(...outcome.records);
  }
  return { kind: "records", records };
}

/**
 * `closures` — обов'язковий аргумент, а не значення за замовчуванням.
 *
 * Та сама причина, що й у `validateClosedDate`: виклик без закриттів мовчки
 * повернув би поведінку до шкільного календаря, і дата в канікули знову
 * створювала б записи. Тип тепер цього не дозволяє — порожній список треба
 * передати явно.
 */
export function buildRecords(
  input: RequestInput,
  positions: readonly Position[],
  closures: readonly Closure[],
): BuildResult {
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
    const outcome = planDay(day, byId, closures);
    if (outcome.kind === "fail") return fail(outcome.message);
    if (outcome.kind === "skip") {
      skipped.push({ date: day.date, message: outcome.message });
      continue;
    }
    records.push(...outcome.records);
  }

  // Не лишилось жодної прийнятої дати — заявки немає. Повідомлення беремо з
  // відпалих дат, а не константою: коли єдину дату закрив календар, працівник
  // має побачити назву закриття (AC-CAL-03), а не «You have no working hours
  // on this day». Для дати без розкладу цей текст і так NO_WORKING_HOURS.
  if (records.length === 0) {
    return fail(skipped.map((s) => s.message).join(" ") || NO_WORKING_HOURS);
  }

  return { ok: true, records, skipped };
}
