// WS11, трек B: що РЕАЛЬНО доходить до Sentry з серверної дії.
//
// Попередній тест перевіряв об'єкт `dbErrorReport`; рев'ю CodeRabbit слушно зауважило, що
// це не те саме, що подія. Тут мокаємо сам SDK і дивимось на аргументи `captureException`:
// об'єкт помилки, теги й extra — усе, що поїхало б у мережу.

import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({ captureException }));
// report.ts позначено `server-only`; у тестовому середовищі цей імпорт падає, тож глушимо.
vi.mock("server-only", () => ({}));

const { reportDbError } = await import("@/lib/observability/report");

// Так виглядає справжня відмова: деталі містять увесь рядок разом із коментарем людини.
const CHECK_VIOLATION = {
  message:
    'new row for relation "leave_requests" violates check constraint "leave_requests_relationship_check"',
  code: "23514",
  details: 'Failing row contains (42, sick, 2026-11-24, "мама в лікарні, беру три дні").',
};

describe("reportDbError", () => {
  beforeEach(() => captureException.mockClear());

  it("у подію не потрапляє ні коментар заявки, ні деталі рядка", () => {
    reportDbError(CHECK_VIOLATION, "submit_leave_request");

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, context] = captureException.mock.calls[0];
    const sent = JSON.stringify({ message: (error as Error).message, context });
    expect(sent).not.toContain("мама в лікарні");
    expect(sent).not.toContain("Failing row contains");
  });

  it("надсилається новий Error, а не той, що прийшов із supabase-js", () => {
    reportDbError(CHECK_VIOLATION, "submit_leave_request");

    const [error] = captureException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("db 23514 at submit_leave_request");
  });

  it("для розбору лишаються місце, SQLSTATE і назва обмеження", () => {
    reportDbError(CHECK_VIOLATION, "submit_leave_request");

    const [, context] = captureException.mock.calls[0];
    expect(context).toEqual({
      tags: { area: "db", where: "submit_leave_request", sqlState: "23514" },
      extra: { constraint: "leave_requests_relationship_check" },
    });
  });

  it("доменна відмова з текстом PM до Sentry не йде взагалі", () => {
    reportDbError({ message: "Record not found", code: "P0001" }, "decide_leave_record");

    expect(captureException).not.toHaveBeenCalled();
  });
});
