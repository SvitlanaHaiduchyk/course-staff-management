/**
 * Що працівник може зробити з власним записом до рішення — вимога
 * `requirements/02-leave-decision.md`, припущення «Before a decision the
 * employee can change only the hours of a record».
 *
 * Тексти — дослівно з AC PM. Ті самі правила тримає база: політика
 * `leave_records_update_own_pending` і функція `public.update_record_hours`
 * (міграція `*_record_hours_and_cancel.sql`).
 */

/** Статуси, у яких запис ще можна виправити або скасувати. */
const PENDING = ["awaiting", "returned"] as const;

/** AC-DECIDE-12: погоджений запис уже не змінюють. */
export const APPROVED_CANNOT_CHANGE = "This record is already approved and cannot be changed";

/** AC-DECIDE-21: змінити можна лише години. */
export const ONLY_HOURS_CAN_CHANGE =
  "Only the hours can be changed. To change the date, position or leave type, cancel this record and submit a new request";

/** AC-DECIDE-16: години запису на розгляді міняти можна; AC-DECIDE-06 — повернутого теж. */
export function canEditHours(status: string): boolean {
  return (PENDING as readonly string[]).includes(status);
}

/** AC-DECIDE-13, AC-DECIDE-17: скасувати можна лише свій запис на розгляді або повернутий. */
export function canCancel(status: string): boolean {
  return (PENDING as readonly string[]).includes(status);
}

/** AC-DECIDE-06: повторно подають лише повернутий запис; AC-DECIDE-17 — скасований ні. */
export function canResubmit(status: string): boolean {
  return status === "returned";
}

export type EditCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * Чи можна змінити години цього запису — і який текст показати, якщо ні.
 *
 * `AC-DECIDE-12` має власне повідомлення, решта кінцевих статусів («Rejected»,
 * «Cancelled») — спільне: PM тексту для них не дає, а вигадувати правил ми не
 * вигадуємо.
 */
export function checkHoursEdit(status: string): EditCheck {
  if (status === "approved") {
    return { ok: false, message: APPROVED_CANNOT_CHANGE };
  }
  if (!canEditHours(status)) {
    return { ok: false, message: "Only a record awaiting a decision can be changed" };
  }
  return { ok: true };
}
