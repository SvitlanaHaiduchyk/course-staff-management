// Що саме їде в трекер помилок. Чиста логіка без Sentry і без server-only, щоб її
// перевіряв звичайний тест; саму відправку робить ./report.ts.

/** SQLSTATE, яким наші функції бази кидають доменні відмови з текстами PM. */
export const DOMAIN_ERROR_CODE = "P0001";

/** Те спільне, що є і в PostgrestError, і в помилці RPC. */
export type ReportableError = { message: string; code?: string; details?: string | null };

/** Готова до надсилання подія: жодного тексту з бази. */
export type DbErrorReport = {
  message: string;
  tags: { area: "db"; where: string; sqlState: string };
  extra: { constraint: string };
};

/**
 * Чи це збій, а не передбачена вимогами відмова.
 *
 * Доменні відмови в наших міграціях кидаються навмисно з `errcode = 'P0001'`
 * (`raise exception … using errcode`) і несуть дослівні тексти PM («Record not found»,
 * «You already have a request for this time») — це нормальна робота форми. Усе інше —
 * відмова в правах (42501), порушення обмеження (23514), обрив зв'язку — збій.
 */
export function isInfrastructureError(error: ReportableError): boolean {
  return error.code !== DOMAIN_ERROR_CODE;
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
// Назва обмеження — єдине, що ми беремо з тексту Postgres: це ідентифікатор зі схеми,
// а не дані людини. Усе інше з message і details лишається в базі.
const CONSTRAINT = /constraint "([a-z0-9_]+)"/;

/**
 * Подія для Sentry з відмови бази.
 *
 * **Текст і `details` з Postgres не передаємо навмисно.** При порушенні `check` Postgres
 * кладе в деталі «Failing row contains (…)» — тобто весь рядок, разом із коментарем
 * заявки. Приклад не вигаданий: заявка типу `sick` із непорожнім `relationship` проходить
 * `buildRecords`, але падає на `leave_requests_relationship_check` із кодом 23514, і цей
 * код фільтр доменних відмов пропускає. Тому повідомлення складаємо самі, а для розбору
 * лишаємо SQLSTATE і назву обмеження — за ними зрозуміло, що саме зламалося.
 */
export function dbErrorReport(error: ReportableError, where: string): DbErrorReport {
  const code = error.code ?? "";
  const sqlState = SQLSTATE.test(code) ? code : "unknown";
  return {
    message: `db ${sqlState} at ${where}`,
    tags: { area: "db", where, sqlState },
    extra: { constraint: CONSTRAINT.exec(error.message)?.[1] ?? "" },
  };
}
