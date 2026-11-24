// WS11, трек B: що саме потрапляє в трекер помилок. Перевіряємо дві межі:
// доменна відмова з текстом PM — не збій, а текст і деталі з Postgres у подію не їдуть.

import { describe, expect, it } from "vitest";

import {
  DOMAIN_ERROR_CODE,
  dbErrorReport,
  isInfrastructureError,
} from "@/lib/observability/db-errors";

describe("isInfrastructureError", () => {
  it("доменна відмова з функції бази не є збоєм", () => {
    expect(isInfrastructureError({ message: "Record not found", code: DOMAIN_ERROR_CODE })).toBe(
      false,
    );
  });

  it("відмова в правах і порушення обмеження — збій", () => {
    expect(isInfrastructureError({ message: "permission denied", code: "42501" })).toBe(true);
    expect(isInfrastructureError({ message: "duplicate key", code: "23505" })).toBe(true);
  });

  it("помилка без коду (обрив зв'язку, збій PostgREST) — теж збій", () => {
    expect(isInfrastructureError({ message: "fetch failed" })).toBe(true);
  });
});

describe("dbErrorReport", () => {
  it("ні текст, ні деталі з Postgres у подію не потрапляють", () => {
    // Саме так виглядає порушення check: Postgres кладе в деталі ВЕСЬ рядок,
    // разом із коментарем заявки, який написала людина.
    const report = dbErrorReport(
      {
        message:
          'new row for relation "leave_requests" violates check constraint "leave_requests_relationship_check"',
        code: "23514",
        details:
          'Failing row contains (42, sick, 2026-11-24, "мама в лікарні, беру три дні").',
      },
      "submit_leave_request",
    );

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("мама в лікарні");
    expect(serialized).not.toContain("Failing row contains");
    expect(report.message).toBe("db 23514 at submit_leave_request");
  });

  it("для розбору лишаються SQLSTATE і назва обмеження", () => {
    const report = dbErrorReport(
      {
        message: 'violates check constraint "leave_requests_relationship_check"',
        code: "23514",
      },
      "submit_leave_request",
    );

    expect(report.tags).toEqual({
      area: "db",
      where: "submit_leave_request",
      sqlState: "23514",
    });
    expect(report.extra.constraint).toBe("leave_requests_relationship_check");
  });

  it("чужий або порожній код стає unknown, а не половиною рядка", () => {
    expect(dbErrorReport({ message: "fetch failed" }, "positions.read").tags.sqlState).toBe(
      "unknown",
    );
    expect(dbErrorReport({ message: "x", code: "PGRST301" }, "x").tags.sqlState).toBe("unknown");
  });
})

describe("dbErrorReport: підроблена назва обмеження", () => {
  it("значення з форми не стає назвою обмеження", () => {
    // Поле id у removeClosure приходить із форми як є. Таке значення дає помилку 22P02,
    // і пошук «constraint "…"» будь-де в тексті витяг би звідти чуже слово.
    const report = dbErrorReport(
      {
        message: 'invalid input syntax for type uuid: "constraint "secret_value""',
        code: "22P02",
      },
      "school_closures.delete",
    );

    expect(report.extra.constraint).toBe("");
    expect(JSON.stringify(report)).not.toContain("secret_value");
  });

  it("назва з середини тексту теж не береться — лише та, що в кінці", () => {
    expect(
      dbErrorReport({ message: 'constraint "forged" and then prose', code: "23514" }, "x").extra
        .constraint,
    ).toBe("");
  });
});
