/**
 * Арифметика залишків — `src/lib/leave/balance.ts`.
 *
 * Числа беремо з прикладів PM у `requirements/03-leave-balance.md`: 420/420,
 * 150/420, 495/495, 75/495. Тексти звіряємо посимвольно разом із комами
 * й словом «day» в однині — так у AC.
 */

import { describe, expect, it } from "vitest";

import {
  type PositionSchedule,
  GRANTED,
  approveNeedsSplit,
  balanceRow,
  dayShare,
  exceedsBalance,
  formatDays,
  hasLimit,
  managerSplitWarning,
  overBalanceWarning,
  schoolYearOf,
  splitLabel,
  suggestedSplit,
  sharesForDate,
  sumShares,
  workingMinutesOn,
} from "@/lib/leave/balance";

/** Основна посада Пн–Пт 08:30–15:30 (420 хв) і додаткова Пн 15:45–17:00 (75 хв). */
const MAIN: PositionSchedule = {
  positionId: "main",
  blocks: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startsAt: "08:30",
    endsAt: "15:30",
  })),
};
const ADDITIONAL: PositionSchedule = {
  positionId: "additional",
  blocks: [{ weekday: 1, startsAt: "15:45", endsAt: "17:00" }],
};

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";

describe("робочі хвилини на дату", () => {
  it("сума по всіх посадах працівника", () => {
    expect(workingMinutesOn([MAIN], TUESDAY)).toBe(420);
    expect(workingMinutesOn([MAIN, ADDITIONAL], MONDAY)).toBe(495);
  });

  it("у вівторок додаткової посади немає — лише 420", () => {
    expect(workingMinutesOn([MAIN, ADDITIONAL], TUESDAY)).toBe(420);
  });

  it("день без розкладу дає нуль", () => {
    expect(workingMinutesOn([MAIN, ADDITIONAL], "2026-11-08")).toBe(0);
  });
});

describe("частка дня", () => {
  it("AC-BALANCE-02: цілий день єдиної посади — 1.00", () => {
    expect(dayShare(420, 420)).toBe(100);
  });

  it("AC-BALANCE-03: 2 год 30 хв із 7 год — 0.36", () => {
    // 150/420 = 0.3571…, half up до 0.36.
    expect(dayShare(150, 420)).toBe(36);
    expect(formatDays(dayShare(150, 420))).toBe("0.36");
  });

  it("AC-BALANCE-05: цілий день двох посад — 1.00, а не 2.00", () => {
    // Два записи на ту саму дату: 420 і 75 хвилин із 495.
    const shares = [dayShare(420, 495), dayShare(75, 495)];
    expect(sumShares(shares)).toBe(100);
  });

  it("AC-BALANCE-06: цілий день лише додаткової посади — 0.15", () => {
    expect(dayShare(75, 495)).toBe(15);
    expect(formatDays(dayShare(75, 495))).toBe("0.15");
  });

  it("одна дата ніколи не більша за 1.00", () => {
    expect(dayShare(600, 420)).toBe(100);
  });

  it("дата без робочих хвилин дає 0.00", () => {
    expect(dayShare(0, 0)).toBe(0);
  });

  it("округлення half up, а не до парного", () => {
    // 0.355 дня: 213 хв із 600. Half up дає 0.36, «до парного» дало б 0.36 теж,
    // тож беремо випадок, де вони різняться: 0.125 → 0.13, а не 0.12.
    expect(dayShare(75, 600)).toBe(13);
  });
});

describe("частки кількох записів однієї дати", () => {
  it("AC-BALANCE-05: дві посади на одну дату дають рівно 1.00", () => {
    expect(sharesForDate([420, 75], 495)).toEqual([85, 15]);
    expect(sumShares(sharesForDate([420, 75], 495))).toBe(100);
  });

  it("три посади, що покривають дату, теж дають рівно 1.00", () => {
    // Незалежне округлення дало б 33 + 33 + 33 = 99: саме через цей випадок
    // частку дати округлюємо один раз, а не кожен запис окремо.
    const shares = sharesForDate([165, 165, 165], 495);

    expect(sumShares(shares)).toBe(100);
    expect(shares.filter((s) => s === 34)).toHaveLength(1);
  });

  it("для одного запису збігається з dayShare", () => {
    expect(sharesForDate([150], 420)).toEqual([dayShare(150, 420)]);
    expect(sharesForDate([75], 495)).toEqual([dayShare(75, 495)]);
  });

  it("AC-BALANCE-06: неповне покриття дати 1.00 не дає", () => {
    expect(sumShares(sharesForDate([75], 495))).toBe(15);
  });

  it("порядок записів на результат не впливає", () => {
    const a = sumShares(sharesForDate([165, 165, 165], 495));
    const b = sumShares(sharesForDate([165, 165, 165].reverse(), 495));

    expect(a).toBe(b);
  });

  it("дата без робочих хвилин дає нулі", () => {
    expect(sharesForDate([60, 30], 0)).toEqual([0, 0]);
  });
});

describe("навчальний рік", () => {
  it("вересень починає новий рік", () => {
    expect(schoolYearOf("2027-09-01")).toBe(2027);
    expect(schoolYearOf("2027-08-31")).toBe(2026);
  });

  it("AC-BALANCE-22: заявка через межу років дає різні роки", () => {
    expect(schoolYearOf("2027-08-31")).not.toBe(schoolYearOf("2027-09-01"));
  });

  it("AC-BALANCE-21: рік визначає дата запису, а не дата рішення", () => {
    // Запис на 2027-08-30, погоджений 2027-09-02, лишається в 2026–2027.
    expect(schoolYearOf("2027-08-30")).toBe(2026);
  });
});

describe("рядок залишків", () => {
  it("AC-BALANCE-01: на старті року надано 18.00, залишилось 18.00", () => {
    const row = balanceRow({ type: "sick" });

    expect(formatDays(row.granted ?? 0)).toBe("18.00");
    expect(formatDays(row.used)).toBe("0.00");
    expect(formatDays(row.remaining ?? 0)).toBe("18.00");
  });

  it("AC-BALANCE-01: типи без ліміту показують лише використано", () => {
    for (const type of ["unpaid", "family_celebration"] as const) {
      const row = balanceRow({ type });
      expect(hasLimit(type)).toBe(false);
      expect(row.granted).toBeNull();
      expect(row.remaining).toBeNull();
      expect(formatDays(row.used)).toBe("0.00");
    }
  });

  it("AC-BALANCE-02: після погодження цілого дня залишилось 17.00", () => {
    const row = balanceRow({ type: "sick", used: 100 });

    expect(formatDays(row.used)).toBe("1.00");
    expect(formatDays(row.remaining ?? 0)).toBe("17.00");
  });

  it("AC-BALANCE-03: після погодження 0.36 залишилось 17.64", () => {
    const row = balanceRow({ type: "sick", used: 36 });

    expect(formatDays(row.remaining ?? 0)).toBe("17.64");
  });

  it("AC-BALANCE-11: перенесені 5.00 дають 23.00 залишку", () => {
    const row = balanceRow({ type: "sick", carriedOver: 500 });

    expect(formatDays(row.granted ?? 0)).toBe("18.00");
    expect(formatDays(row.carriedOver)).toBe("5.00");
    expect(formatDays(row.remaining ?? 0)).toBe("23.00");
  });

  it("AC-BALANCE-20: використано 2.00 — залишилось 16.00", () => {
    expect(formatDays(balanceRow({ type: "personal", used: 200 }).remaining ?? 0)).toBe("16.00");
  });

  it("сума двадцяти часток не пливе", () => {
    // Саме заради цього модуль рахує в цілих сотих: 20 × 0.36 = 7.20 рівно.
    expect(formatDays(sumShares(Array(20).fill(36)))).toBe("7.20");
  });
});

describe("поділ", () => {
  it("AC-BALANCE-10: залишок 0.50 і цілий день — поділ 0.50 / 0.50", () => {
    expect(suggestedSplit(50, 100)).toEqual({ onType: 50, unpaid: 50 });
  });

  it("AC-BALANCE-19: нульовий залишок — усе в Unpaid leave", () => {
    expect(suggestedSplit(0, 100)).toEqual({ onType: 0, unpaid: 100 });
  });

  it("у межах залишку поділу немає", () => {
    expect(suggestedSplit(1800, 100)).toEqual({ onType: 100, unpaid: 0 });
    expect(exceedsBalance(1800, 100)).toBe(false);
  });

  it("тип без ліміту залишок не перевищує ніколи", () => {
    expect(exceedsBalance(GRANTED.unpaid, 100)).toBe(false);
  });
});

describe("тексти PM", () => {
  it("AC-BALANCE-08: попередження про цілий день понад залишок 0.50", () => {
    expect(overBalanceWarning("personal", 50, 100)).toBe(
      "Your Personal leave balance is 0.50 day. Another 0.50 day will be counted as Unpaid leave",
    );
  });

  it("AC-BALANCE-15: попередження про частку дня понад залишок 0.20", () => {
    expect(overBalanceWarning("personal", 20, 36)).toBe(
      "Your Personal leave balance is 0.20 day. Another 0.16 day will be counted as Unpaid leave",
    );
  });

  it("AC-BALANCE-17: одне попередження на заявку з трьох дат", () => {
    // Залишок 1.50, три цілі дні — 3.00. Понад залишок 1.50.
    const requested = sumShares([100, 100, 100]);
    expect(overBalanceWarning("personal", 150, requested)).toBe(
      "Your Personal leave balance is 1.50 day. Another 1.50 day will be counted as Unpaid leave",
    );
  });

  it("AC-BALANCE-09: попередження менеджерові з підказаним поділом", () => {
    expect(managerSplitWarning("personal", 50, suggestedSplit(50, 100))).toBe(
      "This request exceeds the Personal leave balance (0.50 day). " +
        "Suggested: 0.50 day Personal leave, 0.50 day Unpaid leave",
    );
  });

  it("AC-BALANCE-14: залишок береться на момент рішення", () => {
    // Після погодження першого з двох днів залишок 1.50 стає 0.50,
    // і другий день дає рівно той самий текст, що й AC-BALANCE-09.
    const remainingAfterFirst = 150 - 100;
    expect(managerSplitWarning("personal", remainingAfterFirst, suggestedSplit(50, 100))).toBe(
      "This request exceeds the Personal leave balance (0.50 day). " +
        "Suggested: 0.50 day Personal leave, 0.50 day Unpaid leave",
    );
  });

  it("AC-BALANCE-16: спроба погодити без поділу", () => {
    expect(approveNeedsSplit("personal", 50)).toBe(
      "The Personal leave balance is 0.50 day: approve with the suggested split or reject",
    );
  });

  it("AC-BALANCE-18: поділ на записі", () => {
    expect(splitLabel("personal", suggestedSplit(50, 100))).toBe(
      "0.50 Personal leave + 0.50 Unpaid leave",
    );
  });

  it("AC-BALANCE-19: поділ за нульового залишку", () => {
    expect(splitLabel("personal", suggestedSplit(0, 100))).toBe(
      "0.00 Personal leave + 1.00 Unpaid leave",
    );
  });
});
