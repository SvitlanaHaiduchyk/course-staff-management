import "server-only";

// WS11, трек B: серверні помилки, які НЕ спливають як виняток.
//
// Серверні дії порталу перетворюють відмову бази на `redirect("…?error=…")` — щоб людина
// побачила текст і не втратила введене. Побічний наслідок: винятку немає, тож
// `onRequestError` такої події не бачить, і в Sentry порожньо. На це вказало рев'ю
// CodeRabbit у PR #97, і воно мало рацію.
//
// «Слати все» зробило б трекер марним: більшість таких помилок — дослівні тексти PM з
// функцій бази. Межу проводить `isInfrastructureError` (./db-errors.ts).

import * as Sentry from "@sentry/nextjs";

import { isInfrastructureError, type ReportableError } from "@/lib/observability/db-errors";

/**
 * Повідомити Sentry про відмову бази чи RPC. Доменні відмови (`P0001`) пропускає мовчки.
 *
 * @param error помилка від supabase-js
 * @param where місце в коді: `submit_leave_request`, `positions.read` тощо — стає тегом,
 *   бо стек серверної дії сам по собі мало що каже
 */
export function reportDbError(error: ReportableError, where: string): void {
  if (!isInfrastructureError(error)) return;
  Sentry.captureException(error, {
    tags: { area: "db", where },
    // Повідомлення Postgres технічне (назва обмеження, SQLSTATE), даних користувача в ньому
    // немає. Введеного тексту заявки сюди не кладемо навмисно.
    extra: { code: error.code ?? "", details: error.details ?? "" },
  });
}
