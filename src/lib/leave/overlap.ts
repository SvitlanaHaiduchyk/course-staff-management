/**
 * Заборона перетину записів однієї посади в часі.
 *
 * Записи однієї посади не можуть перетинатися, коли мають статус «Awaiting decision»,
 * «Returned for revision» або «Approved»; «Rejected» і «Cancelled» не блокують
 * (припущення PM). Запис, який редагують, не перевіряється сам із собою —
 * рішення PM на питання Q2 (…spec#2), AC-DECIDE-22.
 */

import { type DraftRecord } from "./build";
import { toMinutes } from "./schedule";

/** Статуси запису. «Rejected» і «Cancelled» — кінцеві й не блокують нових заявок. */
export type RecordStatus = "awaiting" | "approved" | "rejected" | "returned" | "cancelled";

/** Наявний запис працівника, проти якого перевіряємо нову заявку. */
export type ExistingRecord = {
  readonly id: string;
  readonly positionId: string;
  readonly date: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: RecordStatus;
};

const BLOCKING: readonly RecordStatus[] = ["awaiting", "returned", "approved"];

/** Чи блокує цей запис нові заявки на той самий час. */
export function isBlocking(status: RecordStatus): boolean {
  return BLOCKING.includes(status);
}

/** AC-LEAVE-13, AC-LEAVE-16, AC-DECIDE-22: текст із датою й годинами наявного запису. */
export function overlapMessage(record: ExistingRecord): string {
  return `You already have a request for this time: ${record.date} ${record.startsAt}–${record.endsAt}`;
}

/** Чи перетинаються два проміжки. Дотик межами (10:00–11:00 і 11:00–12:00) перетином не є. */
function intersects(
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string },
): boolean {
  return toMinutes(a.startsAt) < toMinutes(b.endsAt) && toMinutes(b.startsAt) < toMinutes(a.endsAt);
}

/**
 * Шукає перший наявний запис, що перетинається з будь-яким записом заявки.
 *
 * `excludeId` — запис, який редагують: він виключається з перевірки самого себе,
 * інакше AC-DECIDE-06 і AC-DECIDE-16 не могли б виконатися (рішення PM на Q2).
 */
export function findOverlap(
  existing: readonly ExistingRecord[],
  candidates: readonly DraftRecord[],
  excludeId?: string,
): ExistingRecord | null {
  for (const record of existing) {
    if (record.id === excludeId) continue;
    if (!isBlocking(record.status)) continue;

    for (const candidate of candidates) {
      if (candidate.positionId !== record.positionId) continue;
      if (candidate.date !== record.date) continue;
      if (intersects(candidate, record)) return record;
    }
  }
  return null;
}
