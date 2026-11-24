// Межа «збій vs передбачена відмова» — чиста функція без Sentry і без server-only,
// щоб її перевіряв звичайний тест. Саму відправку робить ./report.ts.

/** SQLSTATE, яким наші функції бази кидають доменні відмови з текстами PM. */
export const DOMAIN_ERROR_CODE = "P0001";

/** Те спільне, що є і в PostgrestError, і в помилці RPC. */
export type ReportableError = { message: string; code?: string; details?: string | null };

/**
 * Чи це збій, а не передбачена вимогами відмова.
 *
 * Доменні відмови в наших міграціях кидаються навмисно з `errcode = 'P0001'`
 * (`raise exception … using errcode`) і несуть дослівні тексти PM («Record not found»,
 * «You already have a request for this time») — це нормальна робота форми. Усе інше —
 * відмова в правах (42501), порушення обмеження, обрив зв'язку — збій.
 */
export function isInfrastructureError(error: ReportableError): boolean {
  return error.code !== DOMAIN_ERROR_CODE;
}
