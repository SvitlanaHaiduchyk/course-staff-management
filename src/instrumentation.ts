// WS11, трек B: ініціалізація Sentry на сервері (Node і Edge).
// Next викликає `register()` один раз на старті кожного середовища виконання,
// а `onRequestError` — на кожній помилці server action, route handler і рендера RSC.
// Саме через нього до Sentry доходять помилки, які користувач бачить як «щось пішло не так».

import * as Sentry from "@sentry/nextjs";

import { sentryEnvFromProcess, sentryOptions } from "@/lib/observability/sentry-options";

export function register() {
  Sentry.init(sentryOptions(sentryEnvFromProcess()));
}

export const onRequestError = Sentry.captureRequestError;
