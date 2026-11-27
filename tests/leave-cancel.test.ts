/**
 * Чиста логіка скасування погодженого запису — `src/lib/leave/cancel.ts`.
 *
 * Межі тут ті самі, що в базі (`tests/db/cancel.test.ts`): сторінка й функція
 * Postgres мають вирішувати однаково, інакше людина побачить кнопку, яка
 * завжди падає.
 */

import { describe, expect, it } from "vitest";

import {
  CANCELLATION_DECLINED,
  CANCELLATION_REQUESTED,
  CANCEL_NEEDS_NOTE,
  canRequestCancellation,
  cancellationNote,
  checkReason,
  isCancellationDecision,
} from "@/lib/leave/cancel";

const TODAY = "2026-12-01";

describe("чи можна просити скасування", () => {
  it("AC-CANCEL-01: погоджений запис у майбутньому — можна", () => {
    expect(
      canRequestCancellation({
        status: "approved",
        onDate: "2026-12-10",
        today: TODAY,
        hasOpenRequest: false,
      }),
    ).toBe(true);
  });

  it("AC-CANCEL-05: запис у минулому — не можна, на сьогодні — можна", () => {
    // Межа з AC — «today or later», тобто нестрога. Заміна `>=` на `>` зробила б
    // сьогоднішній запис нескасовним, і саме цей тест її ловить.
    const base = { status: "approved", today: TODAY, hasOpenRequest: false };
    expect(canRequestCancellation({ ...base, onDate: "2026-11-30" })).toBe(false);
    expect(canRequestCancellation({ ...base, onDate: TODAY })).toBe(true);
  });

  it("AC-CANCEL-06: коли запит уже відкрито — кнопки більше немає", () => {
    expect(
      canRequestCancellation({
        status: "approved",
        onDate: "2026-12-10",
        today: TODAY,
        hasOpenRequest: true,
      }),
    ).toBe(false);
  });

  it("непогоджені записи цим шляхом не скасовують", () => {
    // «Awaiting decision» і «Returned for revision» працівник скасовує сам
    // (AC-DECIDE-13, AC-DECIDE-17) — без запиту до менеджера.
    for (const status of ["awaiting", "returned", "rejected", "cancelled"]) {
      expect(
        canRequestCancellation({
          status,
          onDate: "2026-12-10",
          today: TODAY,
          hasOpenRequest: false,
        }),
      ).toBe(false);
    }
  });
});

describe("що написано на записі", () => {
  it("AC-CANCEL-01: відкритий запит — позначка «Cancellation requested»", () => {
    expect(cancellationNote({ reason: "Plans changed", decision: null, comment: null })).toBe(
      CANCELLATION_REQUESTED,
    );
  });

  it("AC-CANCEL-03: відхилений запит — причина менеджера", () => {
    expect(
      cancellationNote({ reason: "Plans changed", decision: "declined", comment: "Exam week" }),
    ).toBe(`${CANCELLATION_DECLINED}: Exam week`);
  });

  it("AC-CANCEL-08: скасування менеджером — його примітка", () => {
    expect(
      cancellationNote({
        reason: "Cancelled by the manager",
        decision: "confirmed",
        comment: "Event moved to January",
      }),
    ).toBe("Event moved to January");
  });

  it("без запиту на записі нічого не пишемо", () => {
    expect(cancellationNote(null)).toBeNull();
    expect(cancellationNote(undefined)).toBeNull();
  });
});

describe("перевірки перед викликом бази", () => {
  it("AC-CANCEL-09: порожня примітка до бази не йде", () => {
    expect(checkReason("   ", CANCEL_NEEDS_NOTE)).toEqual({
      ok: false,
      message: CANCEL_NEEDS_NOTE,
    });
    expect(checkReason("Event moved", CANCEL_NEEDS_NOTE)).toEqual({ ok: true });
  });

  it("рішення по запиту — лише «confirmed» і «declined»", () => {
    expect(isCancellationDecision("confirmed")).toBe(true);
    expect(isCancellationDecision("declined")).toBe(true);
    expect(isCancellationDecision("approved")).toBe(false);
  });
});
