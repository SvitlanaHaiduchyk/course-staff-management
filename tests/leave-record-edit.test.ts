/**
 * Правила працівника щодо власного запису — `src/lib/leave/record-edit.ts`.
 *
 * Тут правило й текст; що те саме тримає база, перевіряє
 * `tests/db/record-edit.test.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  APPROVED_CANNOT_CHANGE,
  ONLY_HOURS_CAN_CHANGE,
  canCancel,
  canEditHours,
  canResubmit,
  checkHoursEdit,
} from "@/lib/leave/record-edit";

describe("що працівник може зі своїм записом", () => {
  it("AC-DECIDE-16: години запису на розгляді змінити можна", () => {
    expect(canEditHours("awaiting")).toBe(true);
  });

  it("AC-DECIDE-06: повернутий запис виправляють і подають знову", () => {
    expect(canEditHours("returned")).toBe(true);
    expect(canResubmit("returned")).toBe(true);
  });

  it("AC-DECIDE-13: запис на розгляді скасувати можна", () => {
    expect(canCancel("awaiting")).toBe(true);
  });

  it("AC-DECIDE-17: скасований запис повторно не подати", () => {
    expect(canResubmit("cancelled")).toBe(false);
    expect(canEditHours("cancelled")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });

  it("AC-DECIDE-12: погоджений запис не змінити, і текст саме той", () => {
    expect(canEditHours("approved")).toBe(false);
    expect(checkHoursEdit("approved")).toEqual({
      ok: false,
      message: APPROVED_CANNOT_CHANGE,
    });
    expect(APPROVED_CANNOT_CHANGE).toBe("This record is already approved and cannot be changed");
  });

  it("AC-DECIDE-21: змінити можна лише години — текст дослівно з вимоги", () => {
    expect(ONLY_HOURS_CAN_CHANGE).toBe(
      "Only the hours can be changed. To change the date, position or leave type, " +
        "cancel this record and submit a new request",
    );
  });

  it("відхилений запис — кінцевий", () => {
    expect(canEditHours("rejected")).toBe(false);
    expect(canCancel("rejected")).toBe(false);
    expect(checkHoursEdit("rejected").ok).toBe(false);
  });

  it("запис на розгляді проходить перевірку", () => {
    expect(checkHoursEdit("awaiting")).toEqual({ ok: true });
  });
});
