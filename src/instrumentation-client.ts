// WS11, трек B: ініціалізація Sentry у браузері. Next вантажить цей файл першим на клієнті.
// Session Replay і трасування навмисно не вмикаємо (жодної інтеграції не додано):
// безкоштовна квота має йти на помилки, а запис сесії показав би чужі персональні дані.

import * as Sentry from "@sentry/nextjs";

import { sentryEnvFromProcess, sentryOptions } from "@/lib/observability/sentry-options";

Sentry.init(sentryOptions(sentryEnvFromProcess()));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
