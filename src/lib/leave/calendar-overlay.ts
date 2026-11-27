/**
 * Особистий шар шкільного календаря: робочі дні людини та її відпустки.
 *
 * Навіщо він: шкільний календар за вимогами PM показує **спільні** закриття,
 * які створює адміністратор. Людина ж дивиться на рік, щоб зрозуміти свою
 * картину — коли школа зачинена, коли вона сама працює і коли в неї відпустка.
 * Жодного правила вимог це не змінює: закриття лишаються тим, чим були, а шар
 * додає те, що портал і так показує про людину на інших сторінках.
 *
 * Модуль чистий — жодних запитів: сторінка приносить рядки, тут лише
 * перетворення, яке перевіряє тест.
 */

import { blocksAfterClosure, closedFrom } from "./closure";
import { hhmm, minutesOfTime, weekdayOf } from "./week";


/** Запис відпустки так, як його віддає база, з типом із заявки. */
export type LeaveMark = {
  readonly on_date: string;
  readonly status: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly leave_type: string | null;
};


/**
 * Відпустки за датами. На одну дату може припасти кілька записів — по одному
 * на посаду (AC-LEAVE-02), тож значення — масив, а не один запис.
 */
export function leavesByDate(
  records: readonly LeaveMark[],
): ReadonlyMap<string, readonly LeaveMark[]> {
  const byDate = new Map<string, LeaveMark[]>();
  for (const record of records) {
    const day = byDate.get(record.on_date);
    if (day) day.push(record);
    else byDate.set(record.on_date, [record]);
  }
  return byDate;
}

/** Блок розкладу з часом — так, як його віддає база. */
export type TimedBlock = {
  readonly weekday: number;
  readonly starts_at: string;
  readonly ends_at: string;
};

/** Посада з розкладом і назвою: все, що потрібно, щоб підписати блок дня. */
export type TimedPosition = {
  readonly id: string;
  readonly job_title: string;
  readonly schedule_blocks?: readonly TimedBlock[] | null;
};

/** Блок розкладу на конкретний день разом із посадою, якій він належить. */
export type DayBlock = TimedBlock & {
  readonly positionId: string;
  readonly jobTitle: string;
};

/**
 * Блоки розкладу всіх посад людини на дату, у порядку часу.
 *
 * Одна функція на два показники: тижнева сітка «Мого розкладу»
 * (`ScheduleWeek`) і віконечко дня у шкільному календарі. Доки це жило лише в
 * сітці, календар мусив би написати те саме вдруге — а дві реалізації «які в
 * мене години цього дня» розійшлися б на першій же посаді без розкладу.
 *
 * Збираємо по всіх посадах разом: у додатковій посаді можуть бути свої години
 * того самого дня (`AC-LEAVE-02`), і показати лише головну означало б
 * приховати половину дня.
 */
export function blocksOn(positions: readonly TimedPosition[], date: string): DayBlock[] {
  const weekday = weekdayOf(date);
  return positions
    .flatMap((position) =>
      (position.schedule_blocks ?? [])
        .filter((block) => block.weekday === weekday)
        .map((block) => ({ ...block, positionId: position.id, jobTitle: position.job_title })),
    )
    .sort((a, b) => minutesOfTime(a.starts_at) - minutesOfTime(b.starts_at));
}

/** Закриття школи так, як його віддає база: час початку закриття або `null`. */
export type ClosureTimes = { readonly closes_at: string | null };

/**
 * Блоки, які лишаються відкритими після закриття школи (`AC-CAL-04`).
 *
 * Правило не переписуємо: рахує його `blocksAfterClosure` — та сама функція,
 * якою користується перевірка заявки, і та сама, що продубльована в SQL. Тут
 * лише перейменування полів: доменний модуль говорить `startsAt`, а рядки
 * бази — `starts_at`.
 *
 * Навіщо це календарю: у день канікул показати «08:30–15:30» означало б
 * сказати неправду просто під рядком «Школа зачинена цілий день».
 */
export function openBlocks(blocks: readonly DayBlock[], closure: ClosureTimes | null): DayBlock[] {
  const from = closedFrom(
    closure === null
      ? null
      : {
          name: "",
          startsOn: "",
          endsOn: "",
          closesAt: closure.closes_at === null ? null : hhmm(closure.closes_at),
        },
  );

  return blocksAfterClosure(
    blocks.map((block) => ({
      ...block,
      startsAt: hhmm(block.starts_at),
      endsAt: hhmm(block.ends_at),
    })),
    from,
  ).map(({ startsAt, endsAt, ...block }) => ({ ...block, starts_at: startsAt, ends_at: endsAt }));
}
