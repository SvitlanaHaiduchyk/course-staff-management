// D0: чи відповіла база на запит /api/health. Чиста функція — щоб перевірити всі гілки тестом без мережі.
// Запит — публічним ключем до таблиці без доступу для anon: «немає прав» (42501) теж означає, що Postgres живий.

/** Код SQLSTATE Postgres, напр. 42501 «permission denied»: запит дійшов до бази. */
const SQLSTATE = /^[0-9A-Z]{5}$/;
/** PostgREST не може під'єднатися до бази. */
const PGRST_DB_DOWN = /^PGRST00[0-3]$/;
/** Supabase відповідає 540, коли безкоштовний проєкт призупинено (Dashboard → Resume project). */
const SUPABASE_PAUSED = 540;

export type DbProbe = { status: number; error: { code?: string; message?: string } | null };
export type DbHealth = { db: "ok" | "down"; reason: string };

export function classifyDbProbe({ status, error }: DbProbe): DbHealth {
  if (status === SUPABASE_PAUSED) return { db: "down", reason: "paused" };
  const code = error?.code ?? "";
  if (!error || SQLSTATE.test(code) || (code.startsWith("PGRST") && !PGRST_DB_DOWN.test(code))) {
    return { db: "ok", reason: "" };
  }
  if (/api key/i.test(error.message ?? "")) return { db: "down", reason: "invalid-api-key" };
  // 0 — мережа (Supabase недоступний або хибний URL), 5xx, PGRST000–003.
  return { db: "down", reason: `status-${status}${code ? `-${code}` : ""}` };
}

/**
 * Назва середовища для `/api/health` (WS11, трек A).
 *
 * На staging системна `VERCEL_ENV` усе одно дорівнює `preview`, тож сам по собі
 * прев'ю-деплой гілки від звичайного PR не відрізнити. Тому середовище називає
 * окрема змінна `APP_ENV`, задана у Vercel **лише для гілки** `staging`.
 */
export function appEnvOf(appEnv: string | undefined, vercelEnv: string | undefined): string {
  const named = appEnv?.trim();
  return named && named.length > 0 ? named : (vercelEnv ?? "local");
}

/**
 * Ref проєкту Supabase з його адреси — `https://<ref>.supabase.co` → `<ref>`.
 *
 * Це не секрет: ref є в кожній відповіді API і в клієнтському коді. Саме за ним
 * у звіті видно, що staging ходить у СВОЮ базу, а не в прод: однакові ref у
 * двох середовищах означали б, що перевизначення змінних не спрацювало.
 */
export function supabaseRefOf(url: string | undefined): string {
  return url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.(?:co|red)/)?.[1] ?? "unknown";
}
