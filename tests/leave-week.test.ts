// Тижневий вигляд розкладу — форматування й геометрія, не доменні правила,
// тож AC ID тут немає свідомо (як і в tests/leave-format.test.ts).
// Головне, що перевіряємо: арифметика дат не залежить від часової зони машини,
// а смуги не вилазять за межі сітки.
import { describe, expect, it } from "vitest";

import {
  assignLanes,
  dayNumber,
  geometryOf,
  hhmm,
  hourTicks,
  hourWindow,
  minutesOfTime,
  mondayOf,
  resolveMonday,
  shiftWeeks,
  tickPercent,
  WEEKDAY_SHORT,
  weekDates,
  weekdayOf,
  weekRangeLabel,
} from "@/lib/leave/week";

const span = (starts_at: string, ends_at: string) => ({ starts_at, ends_at });

describe("час", () => {
  it("хвилини від півночі рахуються з HH:MM:SS", () => {
    expect(minutesOfTime("08:30:00")).toBe(510);
  });

  it("хвилини від півночі рахуються і з HH:MM", () => {
    expect(minutesOfTime("16:00")).toBe(960);
  });

  it("час бази скорочується до годин і хвилин", () => {
    expect(hhmm("08:00:00")).toBe("08:00");
  });
});

describe("дати тижня", () => {
  it("понеділок — перший день тижня, неділя — сьомий", () => {
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(weekdayOf("2026-11-08")).toBe(7);
  });

  it("понеділок свого тижня знайдено і для самого понеділка", () => {
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
  });

  it("понеділок свого тижня знайдено для неділі — це та сама дата, що й для суботи", () => {
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(mondayOf("2026-11-07")).toBe("2026-11-02");
  });

  it("тиждень — сім дат поспіль від понеділка", () => {
    expect(weekDates("2026-11-02")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("зсув на тиждень назад переходить через межу місяця", () => {
    expect(shiftWeeks("2026-11-02", -1)).toBe("2026-10-26");
  });

  it("зсув на тиждень уперед переходить через межу року", () => {
    expect(shiftWeeks("2026-12-28", 1)).toBe("2027-01-04");
  });

  it("число місяця — без провідного нуля", () => {
    expect(dayNumber("2026-11-03")).toBe("3");
  });

  it("підпис тижня називає місяць один раз, коли тиждень у ньому й лишається", () => {
    expect(weekRangeLabel("2026-11-02")).toBe("2 – 8 листопада 2026");
  });

  it("підпис тижня називає обидва місяці, коли тиждень їх перетинає", () => {
    expect(weekRangeLabel("2026-11-30")).toBe("30 листопада – 6 грудня 2026");
  });

  it("без параметра показуємо тиждень сьогоднішнього дня", () => {
    expect(resolveMonday(undefined, "2026-11-05")).toBe("2026-11-02");
  });

  it("параметр адреси задає тиждень", () => {
    expect(resolveMonday("2026-10-28", "2026-11-05")).toBe("2026-10-26");
  });

  it("кривий параметр не ламає сторінку — показуємо цей тиждень", () => {
    expect(resolveMonday("минулого разу", "2026-11-05")).toBe("2026-11-02");
  });

  it("повторений параметр адреси (?week=a&week=b) теж не ламає сторінку", () => {
    expect(resolveMonday(["2026-10-28", "2026-10-29"], "2026-11-05")).toBe("2026-11-02");
  });

  it("короткі назви днів відповідають weekday з бази", () => {
    expect(WEEKDAY_SHORT[weekdayOf("2026-11-02")]).toBe("Пн");
  });
});

describe("вікно годин", () => {
  it("без жодного блока показуємо звичайний шкільний день", () => {
    expect(hourWindow([])).toEqual({ fromHour: 8, toHour: 17 });
  });

  it("вікно має годину запасу з обох боків", () => {
    expect(hourWindow([span("08:30:00", "15:30:00")])).toEqual({ fromHour: 7, toHour: 17 });
  });

  it("вікно охоплює найраніший початок і найпізніше закінчення тижня", () => {
    const window = hourWindow([span("10:00:00", "12:00:00"), span("08:00:00", "18:00:00")]);
    expect(window).toEqual({ fromHour: 7, toHour: 19 });
  });

  it("запас не виводить вікно за межі доби", () => {
    expect(hourWindow([span("00:00:00", "24:00:00")])).toEqual({ fromHour: 0, toHour: 24 });
  });

  it("шкала підписана від першої до останньої години включно", () => {
    expect(hourTicks({ fromHour: 7, toHour: 10 })).toEqual([7, 8, 9, 10]);
  });

  it("година початку вікна стоїть угорі шкали, година кінця — внизу", () => {
    const window = { fromHour: 8, toHour: 16 };
    expect(tickPercent(8, window)).toBe(0);
    expect(tickPercent(16, window)).toBe(100);
  });
});

describe("геометрія смуги", () => {
  it("смуга стоїть там, де її години", () => {
    const geometry = geometryOf(span("09:00:00", "12:00:00"), { fromHour: 8, toHour: 16 });
    expect(geometry).toEqual({ topPercent: 12.5, heightPercent: 37.5 });
  });

  it("смуга, що вилізла за шкалу, обрізається до її межі, а не зникає", () => {
    const geometry = geometryOf(span("06:00:00", "20:00:00"), { fromHour: 8, toHour: 16 });
    expect(geometry).toEqual({ topPercent: 0, heightPercent: 100 });
  });

  it("смуга цілком поза шкалою має нульову висоту", () => {
    const geometry = geometryOf(span("20:00:00", "22:00:00"), { fromHour: 8, toHour: 16 });
    expect(geometry.heightPercent).toBe(0);
  });
});

describe("доріжки", () => {
  it("смуги, що не перетинаються, стоять в одній доріжці", () => {
    const lanes = assignLanes([span("08:00:00", "12:00:00"), span("12:00:00", "16:00:00")]);
    expect(lanes.map((l) => [l.lane, l.lanes])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it("дві посади в ті самі години отримують дві доріжки — жодна не ховається", () => {
    const lanes = assignLanes([span("08:00:00", "16:00:00"), span("09:00:00", "15:00:00")]);
    expect(lanes.map((l) => l.lane)).toEqual([0, 1]);
    expect(lanes.every((l) => l.lanes === 2)).toBe(true);
  });

  it("смуги впорядковано за початком, хоч би як їх передали", () => {
    const lanes = assignLanes([span("13:00:00", "16:00:00"), span("08:00:00", "12:00:00")]);
    expect(lanes.map((l) => l.starts_at)).toEqual(["08:00:00", "13:00:00"]);
  });
});
