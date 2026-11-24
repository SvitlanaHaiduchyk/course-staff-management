// WS11, трек B: ПОВНА подія Sentry, яку склав справжній SDK.
//
// Попередній тест мокав SDK і дивився на аргументи виклику; рев'ю CodeRabbit слушно
// зауважило, що це ще не подія: контекст, breadcrumbs і додані інтеграціями поля
// складає сам SDK. Тут SDK справжній, DSN синтетичний, а `beforeSend` повертає null —
// подію видно цілком, і в мережу не йде нічого.

import * as Sentry from "@sentry/nextjs";
import { beforeAll, describe, expect, it } from "vitest";

import { dbErrorReport } from "@/lib/observability/db-errors";

const COMMENT = "мама в лікарні, беру три дні";
const CHECK_VIOLATION = {
  message:
    'new row for relation "leave_requests" violates check constraint "leave_requests_relationship_check"',
  code: "23514",
  details: `Failing row contains (42, sick, 2026-11-24, "${COMMENT}").`,
};

let event: unknown = null;

beforeAll(async () => {
  Sentry.init({
    dsn: "https://0123456789abcdef0123456789abcdef@o0.ingest.de.sentry.io/0",
    environment: "test",
    beforeSend(sent) {
      event = sent;
      return null; // подію перехопили — у мережу вона не йде
    },
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
    },
  });

  // Повторюємо те, що робить reportDbError: `report.ts` позначено server-only, тож у
  // тестовому середовищі його не імпортувати — а перевіряємо ми тут подію SDK.
  const { message, tags, extra } = dbErrorReport(CHECK_VIOLATION, "submit_leave_request");
  Sentry.captureException(new Error(message), { tags, extra });
  // Подію складають асинхронні обробники, тому чекаємо на вивантаження.
  await Sentry.flush(5000);
});

describe("повна подія Sentry для відмови бази", () => {
  it("подію справді складено", () => {
    expect(event).not.toBeNull();
  });

  it("ніде в події немає ні коментаря заявки, ні деталей рядка", () => {
    const whole = JSON.stringify(event);

    expect(whole).not.toContain(COMMENT);
    expect(whole).not.toContain("Failing row contains");
    expect(whole).not.toContain("new row for relation");
  });

  it("лишається рівно те, що потрібно для розбору", () => {
    const sent = event as {
      tags?: Record<string, string>;
      extra?: Record<string, string>;
      exception?: { values?: { value?: string }[] };
      breadcrumbs?: unknown[];
    };

    expect(sent.exception?.values?.[0]?.value).toBe("db 23514 at submit_leave_request");
    expect(sent.tags).toMatchObject({
      area: "db",
      where: "submit_leave_request",
      sqlState: "23514",
    });
    expect(sent.extra).toMatchObject({ constraint: "leave_requests_relationship_check" });
    // Breadcrumbs не повинні принести вміст запитів чи консолі.
    expect(sent.breadcrumbs ?? []).toEqual([]);
  });
});
