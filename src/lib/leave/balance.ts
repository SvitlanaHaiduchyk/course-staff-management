/**
 * Залишки відпустки — вимога `requirements/03-leave-balance.md`,
 * специфікація `openspec/specs/leave-balance/spec.md`.
 *
 * **Одиниця виміру — сота частка дня, цілим числом.** Частку дня PM визначає
 * як хвилини запису ÷ усі робочі хвилини працівника на цю дату, округлену
 * half up до 0.01, а баланс — як **суму округлених часток**. Якби ми рахували
 * у `number` з комою, сума двадцяти часток накопичила б похибку подвійного
 * представлення, і 18.00 перестало б дорівнювати 18.00. Тому всередині модуля
 * усе — ціле число сотих (`Hundredths`), а кома з'являється лише у
 * `formatDays` на самому краю.
 *
 * Тексти повідомлень — дослівно з AC PM, англійською, як він їх написав.
 */

import { type LeaveType } from "./build";
import { type ScheduleBlock, scheduleFor, totalMinutes } from "./schedule";

/** Соті частки дня. 100 — цілий день, 36 — 0.36 дня. */
export type Hundredths = number;

/**
 * Типи відпустки з глосарію `requirements/product.md`.
 *
 * Сам тип `LeaveType` живе в `build.ts` — там він з'явився першим, у зрізі
 * подання заявки. Тут лише перелік значень для перевірок і для того, щоб
 * `GRANTED` і `LEAVE_TYPE_LABELS` не могли забути новий тип: `Record<LeaveType, …>`
 * не скомпілюється без нього.
 */
export const LEAVE_TYPES: readonly LeaveType[] = [
  "sick",
  "personal",
  "unpaid",
  "family_celebration",
];

/** Чи рядок — відомий тип відпустки. */
export function isLeaveType(value: string): value is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(value);
}

/** Підписи типів — дослівно як у вимогах PM. */
export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  sick: "Sick leave",
  personal: "Personal leave",
  unpaid: "Unpaid leave",
  family_celebration: "Family celebration",
};

/**
 * Скільки днів надано на навчальний рік.
 *
 * 18.00 днів на «Sick leave» і «Personal leave» окремо; «Unpaid leave» і
 * «Family celebration» ліміту не мають — їх лише рахуємо (припущення PM).
 * Число 18 змінюватиме адміністратор у WS10; тут воно стала.
 */
export const GRANTED: Record<LeaveType, Hundredths | null> = {
  sick: 1800,
  personal: 1800,
  unpaid: null,
  family_celebration: null,
};

/** Чи має тип ліміт. Для типів без ліміту показуємо лише «використано». */
export function hasLimit(type: LeaveType): boolean {
  return GRANTED[type] !== null;
}

/**
 * Навчальний рік, якому належить дата: повертає рік **початку**.
 * 2026 означає 2026–2027. Рік триває з 1 вересня до 31 серпня (припущення PM).
 *
 * `AC-BALANCE-21` і `AC-BALANCE-22`: рік визначає **дата запису**, а не дата
 * рішення, тож пізнє погодження списується з того року, коли була відсутність.
 */
export function schoolYearOf(date: string): number {
  const [year, month] = date.split("-").map(Number);
  return month >= 9 ? year : year - 1;
}

/** Розклад однієї посади працівника. */
export type PositionSchedule = {
  readonly positionId: string;
  readonly blocks: readonly ScheduleBlock[];
};

/**
 * Усі робочі хвилини працівника на дату — знаменник частки дня.
 *
 * Сума по **всіх** посадах: припущення PM каже, що розклади посад одного
 * працівника не перетинаються, тож кожна робоча хвилина належить рівно
 * одній посаді й подвійного рахунку немає.
 */
export function workingMinutesOn(
  positions: readonly PositionSchedule[],
  date: string,
): number {
  return positions.reduce((sum, p) => sum + totalMinutes(scheduleFor(p.blocks, date)), 0);
}

/**
 * Частка дня в сотих, округлена half up.
 *
 * Обидва аргументи — цілі хвилини, тож рахуємо цілочисельно:
 * `floor((200·r + w) / (2·w))` — це рівно `floor(100·r/w + 0.5)`, але без
 * жодної дії з комою, а отже без 0.355 → 0.35 через подвійне представлення.
 *
 * `AC-BALANCE-02`: 420/420 → 100. `AC-BALANCE-03`: 150/420 → 36.
 * `AC-BALANCE-06`: 75/495 → 15. `AC-BALANCE-05`: 495/495 → 100.
 */
export function dayShare(recordMinutes: number, workingMinutes: number): Hundredths {
  if (workingMinutes <= 0) return 0;
  const share = Math.floor((200 * recordMinutes + workingMinutes) / (2 * workingMinutes));
  // Одна дата ніколи не більша за 1.00 дня (припущення PM).
  return Math.min(share, 100);
}

/**
 * Частки кількох записів однієї дати, що в сумі дають рівно частку всієї дати.
 *
 * Чому не просто `dayShare` на кожен запис окремо: припущення PM каже, що
 * записи, які разом покривають усі робочі хвилини дати, рахуються як 1.00 дня,
 * а «одна дата ніколи не більша за 1.00». Незалежне округлення це ламає —
 * три посади по 165 хвилин із 495 дають 0.33 + 0.33 + 0.33 = **0.99**.
 * (Знайшло рев'ю CodeRabbit на PR #31; два записи 420 + 75 з 495, на яких
 * тримався попередній тест, випадково сходилися.)
 *
 * Тому округлюємо **частку дати** один раз, а між записами розподіляємо за
 * найбільшим залишком: кожен отримує свою цілу частину, а решту сотих
 * добирають ті, у кого найбільший дробовий залишок. Для одного запису це
 * те саме, що `dayShare`.
 */
export function sharesForDate(
  recordMinutes: readonly number[],
  workingMinutes: number,
): Hundredths[] {
  if (workingMinutes <= 0 || recordMinutes.length === 0) {
    return recordMinutes.map(() => 0);
  }

  const target = dayShare(
    recordMinutes.reduce((a, b) => a + b, 0),
    workingMinutes,
  );

  // Ціла частина й залишок — без дії з комою: 100·r = floor·w + rem.
  const parts = recordMinutes.map((minutes, index) => ({
    index,
    whole: Math.floor((100 * minutes) / workingMinutes),
    remainder: (100 * minutes) % workingMinutes,
  }));

  const shares = parts.map((p) => p.whole);
  let leftover = target - shares.reduce((a, b) => a + b, 0);

  // Більший залишок — раніше; за рівних залишків виграє менший індекс,
  // щоб результат не залежав від порядку сортування.
  const byRemainder = [...parts].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );

  for (const part of byRemainder) {
    if (leftover <= 0) break;
    shares[part.index] += 1;
    leftover -= 1;
  }

  return shares;
}

/** Сума часток. Баланс — сума **округлених** часток, а не округлена сума. */
export function sumShares(shares: readonly Hundredths[]): Hundredths {
  return shares.reduce((a, b) => a + b, 0);
}

/** «1800» → «18.00». Кома з'являється лише тут. */
export function formatDays(days: Hundredths): string {
  const sign = days < 0 ? "-" : "";
  const abs = Math.abs(days);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Рядок таблиці залишків за одним типом. */
export type BalanceRow = {
  readonly type: LeaveType;
  readonly label: string;
  /** `null` для типів без ліміту — показуємо лише «використано» (AC-BALANCE-01). */
  readonly granted: Hundredths | null;
  readonly carriedOver: Hundredths;
  readonly used: Hundredths;
  /** `null` для типів без ліміту. */
  readonly remaining: Hundredths | null;
};

/**
 * Залишок типу: надано + перенесено − використано.
 *
 * `AC-BALANCE-11`: перенесені дні додаються до наданих без обмеження
 * (18.00 + 5.00 = 23.00 залишку на старті року).
 */
export function balanceRow(input: {
  readonly type: LeaveType;
  readonly carriedOver?: Hundredths;
  readonly used?: Hundredths;
}): BalanceRow {
  const { type } = input;
  const carriedOver = input.carriedOver ?? 0;
  const used = input.used ?? 0;
  const granted = GRANTED[type];

  return {
    type,
    label: LEAVE_TYPE_LABELS[type],
    granted,
    carriedOver,
    used,
    remaining: granted === null ? null : granted + carriedOver - used,
  };
}

/** Поділ запису на оплачувану частину й «Unpaid leave». */
export type Split = {
  /** Списується з балансу типу самого запису. */
  readonly onType: Hundredths;
  /** Зараховується як «Unpaid leave». */
  readonly unpaid: Hundredths;
};

/**
 * Підказаний поділ: оплачувана частина — до залишку, решта — неоплачувана.
 *
 * `AC-BALANCE-19`: за нульового залишку весь запис іде в «Unpaid leave»,
 * а тип самого запису не змінюється.
 */
export function suggestedSplit(remaining: Hundredths, share: Hundredths): Split {
  const onType = Math.max(0, Math.min(remaining, share));
  return { onType, unpaid: share - onType };
}

/**
 * Чи перевищує запис залишок типу. Для типів без ліміту — ніколи.
 *
 * Строге `>`: заявка рівно на залишок перевищенням НЕ є (AC-BALANCE-08 описує
 * попередження лише для заявки **понад** залишок). Те саме порівняння стоїть у
 * decide_leave_record, і розходження між ними показувало б попередження там,
 * де база погоджує запис цілком.
 */
export function exceedsBalance(remaining: Hundredths | null, share: Hundredths): boolean {
  return remaining !== null && share > remaining;
}

// --- Тексти PM ------------------------------------------------------------
// Числа всюди з двома знаками; слово «day» в однині навіть для 1.50 — так у AC.

/**
 * `AC-BALANCE-08`, `AC-BALANCE-15`, `AC-BALANCE-17`: попередження працівникові
 * при поданні. **Одне на всю заявку**, за сумою часток усіх її записів.
 * Заявку не зупиняє.
 */
export function overBalanceWarning(
  type: LeaveType,
  remaining: Hundredths,
  requested: Hundredths,
): string {
  const extra = requested - remaining;
  return (
    `Your ${LEAVE_TYPE_LABELS[type]} balance is ${formatDays(remaining)} day. ` +
    `Another ${formatDays(extra)} day will be counted as Unpaid leave`
  );
}

/** `AC-BALANCE-09`, `AC-BALANCE-14`: попередження менеджерові з підказаним поділом. */
export function managerSplitWarning(
  type: LeaveType,
  remaining: Hundredths,
  split: Split,
): string {
  const label = LEAVE_TYPE_LABELS[type];
  return (
    `This request exceeds the ${label} balance (${formatDays(remaining)} day). ` +
    `Suggested: ${formatDays(split.onType)} day ${label}, ${formatDays(split.unpaid)} day Unpaid leave`
  );
}

/** `AC-BALANCE-16`: спроба погодити понад залишок без поділу. */
export function approveNeedsSplit(type: LeaveType, remaining: Hundredths): string {
  return (
    `The ${LEAVE_TYPE_LABELS[type]} balance is ${formatDays(remaining)} day: ` +
    `approve with the suggested split or reject`
  );
}

/** `AC-BALANCE-18`, `AC-BALANCE-19`: поділ, показаний на погодженому записі. */
export function splitLabel(type: LeaveType, split: Split): string {
  return (
    `${formatDays(split.onType)} ${LEAVE_TYPE_LABELS[type]} + ` +
    `${formatDays(split.unpaid)} Unpaid leave`
  );
}
