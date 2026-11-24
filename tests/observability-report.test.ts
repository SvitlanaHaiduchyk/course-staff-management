// WS11, трек B: що саме потрапляє в трекер помилок. Перевіряємо межу, а не виклик бібліотеки:
// доменна відмова з текстом PM — не збій, і потік таких подій зробив би трекер марним.

import { describe, expect, it } from "vitest";

import { DOMAIN_ERROR_CODE, isInfrastructureError } from "@/lib/observability/db-errors";

describe("isInfrastructureError", () => {
  it("доменна відмова з функції бази не є збоєм", () => {
    expect(
      isInfrastructureError({ message: "Record not found", code: DOMAIN_ERROR_CODE }),
    ).toBe(false);
  });

  it("відмова в правах і порушення обмеження — збій", () => {
    expect(isInfrastructureError({ message: "permission denied", code: "42501" })).toBe(true);
    expect(isInfrastructureError({ message: "duplicate key", code: "23505" })).toBe(true);
  });

  it("помилка без коду (обрив зв'язку, збій PostgREST) — теж збій", () => {
    expect(isInfrastructureError({ message: "fetch failed" })).toBe(true);
  });
});
