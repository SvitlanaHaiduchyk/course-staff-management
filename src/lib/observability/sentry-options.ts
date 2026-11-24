// WS11, трек B: трекер помилок. Налаштування Sentry однакове для трьох середовищ виконання
// (Node, Edge, браузер), тому зібране в одній чистій функції — її перевіряє тест без мережі
// й без справжнього DSN.
//
// Чому `enabled` рахуємо самі, а не лишаємо Sentry: без DSN SDK просто мовчить, але локально
// й у тестах зручніше бачити в коді один прапорець, ніж здогадуватися про поведінку бібліотеки.

import { appEnvOf } from "@/lib/health";

export type SentryOptions = {
  dsn: string;
  enabled: boolean;
  environment: string;
  release: string | undefined;
  tracesSampleRate: number;
  sendDefaultPii: boolean;
};

export type SentryEnv = {
  dsn?: string;
  appEnv?: string;
  vercelEnv?: string;
  sha?: string;
};

/**
 * Налаштування Sentry зі значень середовища.
 *
 * - `enabled` — лише коли DSN заданий: локальний запуск і тести нічого нікуди не шлють;
 * - `environment` — та сама логіка, що в `/api/health`: `APP_ENV` важливіший за `VERCEL_ENV`,
 *   бо на staging системна `VERCEL_ENV` усе одно дорівнює `preview`;
 * - `release` — SHA коміту: у списку помилок одразу видно, який деплой їх приніс;
 * - `tracesSampleRate: 0` — трасування вимкнено навмисно: безкоштовна квота має йти на помилки;
 * - `sendDefaultPii: false` — Sentry не додає до події IP, заголовки з cookie й тіло запиту.
 *   Портал працює з даними працівників школи, тож стектрейс — так, вміст запиту — ні.
 */
export function sentryOptions({ dsn, appEnv, vercelEnv, sha }: SentryEnv): SentryOptions {
  const key = dsn?.trim() ?? "";
  const release = sha?.trim() ?? "";
  return {
    dsn: key,
    enabled: key.length > 0,
    environment: appEnvOf(appEnv, vercelEnv),
    release: release.length > 0 ? release : undefined,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  };
}

/**
 * Ті самі значення з `process.env`.
 *
 * `NEXT_PUBLIC_` варіанти стоять першими, бо в браузер потрапляють лише вони: звичайні
 * `APP_ENV` і `VERCEL_ENV` у клієнтську збірку Next не вшиває. Якщо `NEXT_PUBLIC_APP_ENV`
 * не задано, помилки зі staging прийдуть із середовищем `preview` — видно, але не точно.
 */
export function sentryEnvFromProcess(): SentryEnv {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV,
    sha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
  };
}
