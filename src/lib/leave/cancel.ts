/**
 * Скасування погодженого запису — чиста логіка й тексти PM.
 *
 * Вимоги: requirements/09-cancel-approved.md (знімок 2026-11-27),
 * специфікація: openspec/specs/leave-cancellation/spec.md.
 *
 * Тут немає жодного запиту до бази: межі цього зрізу тримає база (політики,
 * частковий унікальний індекс, три функції), а цей модуль вирішує, що показати
 * людині й чи є сенс узагалі надсилати дію.
 */

/** `AC-CANCEL-10`: чужий запис. */
export const CANCEL_ONLY_OWN = "You can cancel only your own records";

/** `AC-CANCEL-05`: запис із датою в минулому. */
export const CANCEL_IN_THE_PAST = "Records in the past cannot be cancelled";

/** `AC-CANCEL-06`: відкритий запит уже є. */
export const CANCEL_ALREADY_REQUESTED = "Cancellation has already been requested";

/**
 * Порожня причина запиту.
 *
 * Тексту PM для цього випадку немає: він вимагає причину в основному сценарії
 * («gives a reason»), але окремого AC на порожнє поле не дає. Тому поле просто
 * обов'язкове (`required`), а цей текст — остання лінія для прямого POST.
 */
export const CANCEL_NEEDS_REASON = "Tell your manager why you cancel";

/** `AC-CANCEL-04`: відхилення запиту без коментаря. */
export const DECLINE_NEEDS_COMMENT = "Tell the employee why the cancellation is declined";

/** `AC-CANCEL-09`: скасування менеджером без примітки. */
export const CANCEL_NEEDS_NOTE = "Tell the employee why the record is cancelled";

/** `AC-CANCEL-01`: позначка на записі, поки запит не вирішено. */
export const CANCELLATION_REQUESTED = "Cancellation requested";

/** `AC-CANCEL-03`: що бачить працівник після відхилення. */
export const CANCELLATION_DECLINED = "Cancellation declined";

export type CancellationDecision = "confirmed" | "declined";

export function isCancellationDecision(value: string): value is CancellationDecision {
  return value === "confirmed" || value === "declined";
}

/** Запит на скасування так, як його бачить сторінка. */
export type CancellationRow = {
  readonly reason: string;
  readonly decision: CancellationDecision | null;
  readonly comment: string | null;
};

/**
 * Чи можна просити скасування цього запису.
 *
 * Межа «сьогодні або пізніше» (`AC-CANCEL-05`) — **нестрога**: запис на
 * сьогодні скасувати ще можна. Обидві дати порівнюємо як рядки `YYYY-MM-DD`
 * у київському часі: так само рахує й сама база.
 */
export function canRequestCancellation(input: {
  readonly status: string;
  readonly onDate: string;
  readonly today: string;
  readonly hasOpenRequest: boolean;
}): boolean {
  if (input.status !== "approved") return false;
  if (input.hasOpenRequest) return false;
  return input.onDate >= input.today;
}

/**
 * Що написано на записі про скасування — або `null`, якщо писати нема чого.
 *
 * Відкритий запит (`AC-CANCEL-01`) → позначка; відхилений (`AC-CANCEL-03`) →
 * «Cancellation declined: <коментар>»; підтверджений — примітка менеджера
 * (`AC-CANCEL-08`), бо сам статус запису вже «Cancelled».
 */
export function cancellationNote(row: CancellationRow | null | undefined): string | null {
  if (!row) return null;
  if (row.decision === null) return CANCELLATION_REQUESTED;
  if (row.decision === "declined") {
    return row.comment ? `${CANCELLATION_DECLINED}: ${row.comment}` : CANCELLATION_DECLINED;
  }
  return row.comment ?? null;
}

/** Перевірка перед викликом бази: порожня причина чи примітка туди не йде. */
export function checkReason(reason: string, empty: string): { ok: true } | { ok: false; message: string } {
  return reason.trim() === "" ? { ok: false, message: empty } : { ok: true };
}
