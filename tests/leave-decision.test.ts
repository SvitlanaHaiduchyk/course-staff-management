/**
 * Правила рішення менеджера — `src/lib/leave/decision.ts`.
 *
 * Тут перевіряємо саме правило й текст повідомлення; що те саме правило
 * тримає база, перевіряє `tests/db/decisions.test.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  NO_RECORDS_AWAITING,
  OWN_RECORD_NEEDS_ADMIN,
  RETURN_NEEDS_COMMENT,
  alreadyDecidedMessage,
  canDecide,
  checkDecision,
  commentRequired,
  isDecision,
  statusLabel,
} from "@/lib/leave/decision";

const employee = { role: "employee", isOwner: false, managesPosition: false };
const manager = { role: "manager", isOwner: false, managesPosition: true };

describe("хто може вирішувати", () => {
  it("AC-DECIDE-01: відповідальний менеджер посади може", () => {
    expect(canDecide(manager)).toBe(true);
  });

  it("AC-DECIDE-08: менеджер чужої посади не може", () => {
    expect(canDecide({ role: "manager", isOwner: false, managesPosition: false })).toBe(false);
  });

  it("AC-DECIDE-09: працівник без ролі не може", () => {
    expect(canDecide({ ...employee, isOwner: true })).toBe(false);
  });

  it("AC-DECIDE-18: менеджер власної посади не вирішує власний запис", () => {
    expect(canDecide({ role: "manager", isOwner: true, managesPosition: true })).toBe(false);
  });

  it("AC-DECIDE-10: адміністратор може, навіть не керуючи посадою", () => {
    expect(canDecide({ role: "admin", isOwner: false, managesPosition: false })).toBe(true);
  });

  it("AC-DECIDE-19: адміністратор вирішує й власний запис", () => {
    expect(canDecide({ role: "admin", isOwner: true, managesPosition: false })).toBe(true);
  });
});

describe("коментар", () => {
  it("AC-DECIDE-04: для повернення коментар обов'язковий", () => {
    expect(commentRequired("returned")).toBe(true);

    const result = checkDecision({
      viewer: manager,
      status: "awaiting",
      decision: "returned",
      comment: "   ",
    });
    expect(result).toEqual({ ok: false, message: RETURN_NEEDS_COMMENT });
    expect(RETURN_NEEDS_COMMENT).toBe("Tell the employee what to fix");
  });

  it("AC-DECIDE-05: повернення з коментарем проходить", () => {
    expect(
      checkDecision({
        viewer: manager,
        status: "awaiting",
        decision: "returned",
        comment: "Enter hours instead of a whole day",
      }),
    ).toEqual({ ok: true });
  });

  it("AC-DECIDE-03: відхилення без коментаря проходить", () => {
    expect(commentRequired("rejected")).toBe(false);
    expect(
      checkDecision({ viewer: manager, status: "awaiting", decision: "rejected", comment: null }),
    ).toEqual({ ok: true });
  });

  it("AC-DECIDE-24: погодження з коментарем проходить", () => {
    expect(
      checkDecision({
        viewer: manager,
        status: "awaiting",
        decision: "approved",
        comment: "Get well soon",
      }),
    ).toEqual({ ok: true });
  });

  it("AC-DECIDE-23: відхилення з коментарем проходить", () => {
    expect(
      checkDecision({
        viewer: manager,
        status: "awaiting",
        decision: "rejected",
        comment: "Not enough staff that day",
      }),
    ).toEqual({ ok: true });
  });
});

describe("повідомлення", () => {
  it("AC-DECIDE-07: другому менеджеру — який саме статус уже стоїть", () => {
    expect(alreadyDecidedMessage("approved")).toBe("Another manager has already decided: Approved");

    expect(
      checkDecision({ viewer: manager, status: "approved", decision: "rejected", comment: null }),
    ).toEqual({ ok: false, message: "Another manager has already decided: Approved" });
  });

  it("AC-DECIDE-18: менеджеру власного запису", () => {
    expect(
      checkDecision({
        viewer: { role: "manager", isOwner: true, managesPosition: true },
        status: "awaiting",
        decision: "approved",
        comment: null,
      }),
    ).toEqual({ ok: false, message: OWN_RECORD_NEEDS_ADMIN });
    expect(OWN_RECORD_NEEDS_ADMIN).toBe("Your own record is decided by an administrator");
  });

  it("AC-DECIDE-14: порожній список менеджера", () => {
    expect(NO_RECORDS_AWAITING).toBe("No records awaiting decision");
  });

  it("підписи статусів — як у вимозі PM", () => {
    expect(statusLabel("awaiting")).toBe("Awaiting decision");
    expect(statusLabel("returned")).toBe("Returned for revision");
    expect(statusLabel("cancelled")).toBe("Cancelled");
  });

  it("чужого рішення не вигадуємо", () => {
    expect(isDecision("approved")).toBe(true);
    expect(isDecision("deleted")).toBe(false);
  });
});

describe("AC-DECIDE-02: рішення стосується одного запису", () => {
  it("перевірка не залежить від інших записів заявки", () => {
    // checkDecision приймає статус одного запису — спільного стану заявки немає,
    // тож погодити «всю заявку» однією дією неможливо (Out of scope вимоги).
    const first = checkDecision({
      viewer: manager,
      status: "awaiting",
      decision: "approved",
      comment: null,
    });
    const second = checkDecision({
      viewer: manager,
      status: "approved",
      decision: "approved",
      comment: null,
    });

    expect(first).toEqual({ ok: true });
    expect(second.ok).toBe(false);
  });
});
