/**
 * Показ розкладу посади. Жоден AC не задає формату цього рядка, тож назви тестів
 * тут без AC ID: `npm run ac:coverage` їх і не рахує як покриття.
 */

import { describe, expect, it } from "vitest";

import {
  type ScheduleBlockRow,
  positionKindLabel,
  roleLabel,
  scheduleSummary,
} from "../src/lib/leave/format";

const block = (weekday: number, starts: string, ends: string): ScheduleBlockRow => ({
  weekday,
  starts_at: `${starts}:00`,
  ends_at: `${ends}:00`,
});

describe("розклад рядком", () => {
  it("показує один блок дня з днем тижня", () => {
    expect(scheduleSummary([block(1, "08:30", "15:30")])).toBe("Пн 08:30–15:30");
  });

  it("показує обидва блоки дня через кому, щоб перерва була видна", () => {
    const summary = scheduleSummary([block(2, "08:30", "12:00"), block(2, "12:30", "15:30")]);

    expect(summary).toBe("Вт 08:30–12:00, 12:30–15:30");
  });

  it("упорядковує дні за тижнем, а блоки — за часом", () => {
    const summary = scheduleSummary([
      block(3, "08:30", "15:30"),
      block(1, "12:30", "15:30"),
      block(1, "08:30", "12:00"),
    ]);

    expect(summary).toBe("Пн 08:30–12:00, 12:30–15:30 · Ср 08:30–15:30");
  });

  it("порожній розклад дає порожній рядок", () => {
    expect(scheduleSummary([])).toBe("");
  });
});

describe("підписи ролі й типу посади", () => {
  it("показує три ролі продукту людським словом", () => {
    // Ідентифікатори — з requirements/product.md, розділ «Users and roles».
    expect(roleLabel("employee")).toBe("Працівник");
    expect(roleLabel("manager")).toBe("Менеджер");
    expect(roleLabel("admin")).toBe("Адміністратор");
  });

  it("невідому або відсутню роль не вигадує", () => {
    expect(roleLabel(null)).toBe("профіль не знайдено");
    expect(roleLabel(undefined)).toBe("профіль не знайдено");
    expect(roleLabel("member")).toBe("профіль не знайдено");
  });

  it("розрізняє основну й додаткову посаду", () => {
    expect(positionKindLabel("main")).toBe("основна");
    expect(positionKindLabel("additional")).toBe("додаткова");
  });
});
