// WS11, трек B: трекер помилок. Налаштування Sentry однакове для трьох середовищ виконання
// (Node, Edge, браузер), тому зібране в одній чистій функції — її перевіряє тест без мережі
// й без справжнього DSN.
//
// Чому `enabled` рахуємо самі, а не лишаємо Sentry: без DSN SDK просто мовчить, але локально
// й у тестах зручніше бачити в коді один прапорець, ніж здогадуватися про поведінку бібліотеки.

import { appEnvOf } from "@/lib/health";

/**
 * Що саме Sentry **не** збирає. Усе перелічено поіменно, бо замовчування версії 11 —
 * збирати: `userInfo`, `cookies`, `httpHeaders` і `httpBodies` увімкнені, доки їх не вимкнути.
 *
 * `genAI` вимикає запис входу й виходу моделі — окрема вимога до AI-функції: у трекер помилок
 * не має потрапити ні текст користувача, ні відповідь моделі (те саме правило, що в журналі
 * `llm.call`).
 */
export type SentryDataCollection = {
  userInfo: false;
  cookies: false;
  httpHeaders: false;
  httpBodies: [];
  urlQueryParams: false;
  genAI: { inputs: false; outputs: false };
};

export type SentryOptions = {
  dsn: string;
  enabled: boolean;
  environment: string;
  release: string | undefined;
  dataCollection: SentryDataCollection;
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
 * - `dataCollection` — усе вимкнено поіменно (див. тип вище);
 * - `tracesSampleRate` НЕ задаємо навмисно. Нуль його не вимикає: `hasSpansEnabled` у SDK
 *   перевіряє `options.tracesSampleRate != null`, і для нуля це правда, тож spans писалися б,
 *   а успадкований `parentSampled=true` міг би протягти транзакцію в Sentry. Запис spans
 *   вимикає саме відсутність і `tracesSampleRate`, і `tracesSampler`. Помилки від цього не
 *   страждають: їх захоплення від spans не залежить.
 */
export function sentryOptions({ dsn, appEnv, vercelEnv, sha }: SentryEnv): SentryOptions {
  const key = dsn?.trim() ?? "";
  const release = sha?.trim() ?? "";
  return {
    dsn: key,
    enabled: key.length > 0,
    environment: appEnvOf(appEnv, vercelEnv),
    release: release.length > 0 ? release : undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
    },
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
