// WS11, трек B: налаштування трекера помилок. Перевіряємо саме те, чого не видно оком:
// без DSN нічого не надсилається, а середовище на staging не плутається з прев'ю PR.

import { describe, expect, it } from "vitest";

import { sentryOptions } from "@/lib/observability/sentry-options";

describe("sentryOptions", () => {
  it("без DSN Sentry вимкнено — локальний запуск і тести нікуди не шлють подій", () => {
    expect(sentryOptions({}).enabled).toBe(false);
    expect(sentryOptions({ dsn: "   " }).enabled).toBe(false);
  });

  it("з DSN Sentry увімкнено, а пробіли по краях не ламають адресу", () => {
    const options = sentryOptions({ dsn: " https://key@o1.ingest.de.sentry.io/2 " });

    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe("https://key@o1.ingest.de.sentry.io/2");
  });

  it("середовище staging не плутається з прев'ю звичайного PR", () => {
    expect(sentryOptions({ appEnv: "staging", vercelEnv: "preview" }).environment).toBe("staging");
    expect(sentryOptions({ vercelEnv: "preview" }).environment).toBe("preview");
    expect(sentryOptions({}).environment).toBe("local");
  });

  it("release — SHA коміту, щоб було видно, який деплой приніс помилку", () => {
    expect(sentryOptions({ sha: "da77cf8" }).release).toBe("da77cf8");
    expect(sentryOptions({ sha: "" }).release).toBeUndefined();
  });

  it("персональні дані не виїжджають із порталу — кожну категорію вимкнено поіменно", () => {
    const options = sentryOptions({ dsn: "https://key@o1.ingest.de.sentry.io/2" });

    // Замовчування SDK 11 — збирати. `sendDefaultPii` у цій версії вже немає, тож перевіряємо
    // саме `dataCollection`: інакше тест підтверджував би налаштування, якого SDK не читає.
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
    });
  });

  it("частоту вибірки spans не задано — нуль її не вимикає", () => {
    // hasSpansEnabled у SDK перевіряє `tracesSampleRate != null`, і 0 цю умову проходить.
    expect("tracesSampleRate" in sentryOptions({})).toBe(false);
  });
});
