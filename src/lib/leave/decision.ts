/**
 * Правила рішення менеджера по запису відпустки — вимога
 * `requirements/02-leave-decision.md`.
 *
 * Чисті функції без бази: їх перевіряють модульні тести, а база повторює ті самі
 * правила політикою `leave_records_update_decision` і хелпером
 * `private.decides_record` (міграція `*_leave_decisions.sql`). Дві лінії навмисно:
 * сторінку можна обійти, політику — ні.
 *
 * Тексти повідомлень — дослівно з AC PM, англійською, як він їх написав.
 */

/** Три рішення з кроку 3 основного сценарію вимоги. */
export const DECISIONS = ["approved", "rejected", "returned"] as const;
export type Decision = (typeof DECISIONS)[number];

/** П'ять статусів запису; перелік остаточний (припущення PM). */
export const STATUSES = [
  "awaiting",
  "approved",
  "rejected",
  "returned",
  "cancelled",
] as const;
export type RecordStatus = (typeof STATUSES)[number];

export function isDecision(value: string): value is Decision {
  return (DECISIONS as readonly string[]).includes(value);
}

/** Підпис статусу — дослівно як у вимозі PM. */
export function statusLabel(status: string): string {
  switch (status) {
    case "awaiting":
      return "Awaiting decision";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "returned":
      return "Returned for revision";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/** Підпис дії для кнопки рішення. */
export function decisionLabel(decision: Decision): string {
  switch (decision) {
    case "approved":
      return "Approve";
    case "rejected":
      return "Reject";
    case "returned":
      return "Return for revision";
  }
}

/** AC-DECIDE-14: порожній список менеджера. */
export const NO_RECORDS_AWAITING = "No records awaiting decision";

/** AC-DECIDE-04: повернення без коментаря. */
export const RETURN_NEEDS_COMMENT = "Tell the employee what to fix";

/** AC-DECIDE-18: менеджер не вирішує власний запис. */
export const OWN_RECORD_NEEDS_ADMIN = "Your own record is decided by an administrator";

/** AC-DECIDE-07: інший менеджер устиг раніше. */
export function alreadyDecidedMessage(status: string): string {
  return `Another manager has already decided: ${statusLabel(status)}`;
}

/**
 * AC-DECIDE-04: коментар обов'язковий лише для повернення; при погодженні й
 * відхиленні він необов'язковий (AC-DECIDE-03, AC-DECIDE-23, AC-DECIDE-24).
 */
export function commentRequired(decision: Decision): boolean {
  return decision === "returned";
}

/** Хто дивиться на запис. */
export type Viewer = {
  readonly role: string | null | undefined;
  /** Запис належить самому глядачеві. */
  readonly isOwner: boolean;
  /** Глядач — відповідальний менеджер посади запису. */
  readonly managesPosition: boolean;
};

/**
 * Чи може ця людина вирішувати цей запис.
 *
 * Прикметно, що ролі самої по собі не досить: `AC-DECIDE-18` забороняє
 * менеджеру вирішувати власний запис, навіть коли він відповідальний менеджер
 * своєї ж посади. Тому право залежить і від того, **чий** це запис.
 */
export function canDecide(viewer: Viewer): boolean {
  if (viewer.role === "admin") {
    return true; // AC-DECIDE-10, AC-DECIDE-19
  }
  // Роль обов'язкова: саме лише «веде цю посаду» права не дає — те саме
  // правило тримає private.decides_record у базі.
  return viewer.role === "manager" && viewer.managesPosition && !viewer.isOwner;
}

/** Результат перевірки перед зверненням до бази. */
export type DecisionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/**
 * Перевірка рішення до запису в базу: право, статус і коментар.
 *
 * Повертає повідомлення PM, а не «відмовлено»: саме ці тексти показує сторінка
 * (AC-DECIDE-04, AC-DECIDE-07, AC-DECIDE-18).
 */
export function checkDecision(input: {
  readonly viewer: Viewer;
  readonly status: string;
  readonly decision: Decision;
  readonly comment: string | null;
}): DecisionCheck {
  const { viewer, status, decision, comment } = input;

  // AC-DECIDE-18 — перед правом: менеджеру власної посади потрібен саме цей текст.
  if (viewer.isOwner && viewer.role !== "admin") {
    return { ok: false, message: OWN_RECORD_NEEDS_ADMIN };
  }

  if (!canDecide(viewer)) {
    return { ok: false, message: "You cannot decide on this record" };
  }

  if (commentRequired(decision) && (comment === null || comment.trim() === "")) {
    return { ok: false, message: RETURN_NEEDS_COMMENT };
  }

  if (status !== "awaiting") {
    return { ok: false, message: alreadyDecidedMessage(status) };
  }

  return { ok: true };
}
