import { describe, expect, it } from "vitest";

import { type Position, type RequestInput, buildRecords } from "../src/lib/leave/build";
import { type Closure } from "../src/lib/leave/closure";
import { type ScheduleBlock } from "../src/lib/leave/schedule";
import { NO_WORKING_HOURS, schoolClosedMessage } from "../src/lib/leave/validate";

/**
 * Заявка проти шкільного календаря: наскрізний шлях від вибору дат до записів.
 *
 * Вимоги: `requirements/04-school-calendar.md` (знімок 2026-11-18);
 * план: `openspec/changes/impl-school-calendar/tasks.md`, задача 5.
 *
 * Чисті функції обрізання розкладу перевіряє `tests/leave-closure.test.ts`.
 * Тут інше: що `buildRecords` справді ними користується — тобто закрита дата
 * відпадає, а решта заявки лишається.
 */

const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";

/** Основна посада: пн–пт 08:30–15:30. */
const main: Position = {
  id: "pos-main",
  blocks: [1, 2, 3, 4, 5].map((weekday): ScheduleBlock => ({ weekday, startsAt: "08:30", endsAt: "15:30" })),
};

/** Додаткова посада: лише понеділок 15:45–17:00 — уся після звичайного часу закриття. */
const additional: Position = {
  id: "pos-additional",
  blocks: [{ weekday: 1, startsAt: "15:45", endsAt: "17:00" }],
};

const wholeDayOn = (positionId: string) => ({ positionId, included: true, wholeDay: true });

function sick(dates: RequestInput["dates"]): RequestInput {
  return { leaveType: "sick", dates };
}

const holiday: Closure = {
  name: "Winter break",
  startsOn: MONDAY,
  endsOn: MONDAY,
  closesAt: null,
};

const earlyDismissal: Closure = {
  name: "Teachers' meeting",
  startsOn: MONDAY,
  endsOn: MONDAY,
  closesAt: "12:00",
};

describe("заявка проти шкільного календаря", () => {
  it("AC-CAL-03: закрита на цілий день дата відпадає з назвою закриття, решта дат лишається", () => {
    const result = buildRecords(
      sick([
        { date: MONDAY, positions: [wholeDayOn(main.id)] },
        { date: TUESDAY, positions: [wholeDayOn(main.id)] },
      ]),
      [main],
      [holiday],
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.skipped).toEqual([
      { date: MONDAY, message: schoolClosedMessage("Winter break") },
    ]);
    // Вівторок лишився: заявка не гине через одну закриту дату (як AC-LEAVE-21).
    expect(result.ok && result.records).toEqual([
      { positionId: "pos-main", date: TUESDAY, startsAt: "08:30", endsAt: "15:30" },
    ]);
  });

  it("AC-CAL-04: «цілий день» скороченого дня закінчується часом закриття", () => {
    const result = buildRecords(
      sick([{ date: MONDAY, positions: [wholeDayOn(main.id)] }]),
      [main],
      [earlyDismissal],
    );

    expect(result.ok && result.records).toEqual([
      { positionId: "pos-main", date: MONDAY, startsAt: "08:30", endsAt: "12:00" },
    ]);
    expect(result.ok && result.skipped).toEqual([]);
  });

  it("AC-CAL-05: години після часу закриття не приймаються", () => {
    const result = buildRecords(
      sick([
        {
          date: MONDAY,
          positions: [{ positionId: main.id, included: true, wholeDay: false, hours: { startsAt: "13:00", endsAt: "14:00" } }],
        },
      ]),
      [main],
      [earlyDismissal],
    );

    // Перелік у повідомленні — вже ОБРІЗАНИЙ розклад, а не повний робочий день.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("08:30–12:00");
    expect(result.ok === false && result.message).not.toContain("15:30");
  });

  it("AC-CAL-16: скорочений день, що забрав увесь розклад, дає назву закриття, а не «no working hours»", () => {
    // Додаткова посада працює 15:45–17:00, тобто вся після 12:00.
    const result = buildRecords(
      sick([{ date: MONDAY, positions: [wholeDayOn(additional.id)] }]),
      [additional],
      [earlyDismissal],
    );

    // Дата єдина, тож створювати нічого: заявка відмовляє САМЕ текстом про
    // закриття. Це й вимагає «Тоді» AC-CAL-16 — не «no working hours».
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe(schoolClosedMessage("Teachers' meeting"));
    expect(result.ok === false && result.message).not.toBe(NO_WORKING_HOURS);
  });

  it("AC-CAL-16: якщо хоч один блок до закриття лишився, дата приймається", () => {
    // Межа з AC: обидві посади разом, основна працює до 12:00 — дата жива.
    const result = buildRecords(
      sick([{ date: MONDAY, positions: [wholeDayOn(main.id), wholeDayOn(additional.id)] }]),
      [main, additional],
      [earlyDismissal],
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.skipped).toEqual([]);
    expect(result.ok && result.records).toEqual([
      { positionId: "pos-main", date: MONDAY, startsAt: "08:30", endsAt: "12:00" },
    ]);
  });

  it("AC-CAL-09: без закриття та сама дата приймається з повним розкладом", () => {
    // Друга половина AC-CAL-09: прибрали закриття — дата знову працює.
    const result = buildRecords(sick([{ date: MONDAY, positions: [wholeDayOn(main.id)] }]), [main], []);

    expect(result.ok && result.records).toEqual([
      { positionId: "pos-main", date: MONDAY, startsAt: "08:30", endsAt: "15:30" },
    ]);
    expect(result.ok && result.skipped).toEqual([]);
  });

  it("AC-LEAVE-06: дата без розкладу й без закриття лишається зі своїм повідомленням", () => {
    // Закриття не має «з'їдати» чуже повідомлення: субота порожня сама по собі.
    const SATURDAY = "2026-11-07";
    const result = buildRecords(
      sick([{ date: SATURDAY, positions: [wholeDayOn(main.id)] }]),
      [main],
      [holiday],
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe(NO_WORKING_HOURS);
  });
});
