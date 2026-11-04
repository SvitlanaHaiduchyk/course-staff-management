# align-leave-3

## Why

PM додав `AC-LEAVE-22` і уточнив припущення про межі заявки у вимозі
[`requirements/01-leave-request.md`](../../../requirements/01-leave-request.md)
(джерело — `docs/requirements/01-leave-request.md` репо PM, коміт `818bad5`, 2026-11-03;
рішення — [mkozlovskyi-ops/course-staff-management-spec#21](https://github.com/mkozlovskyi-ops/course-staff-management-spec/issues/21)).

Раніше припущення PM звучало так: «The start and the end must each fall inside a block
(the end may equal a block's end)». Тепер: «…(the end may equal a block's end **or the
start of the next block**, as in AC-LEAVE-22)».

Це межа, а не деталь вигляду: заявка з 09:00 до 12:30 при блоках 08:30–12:00 і 12:30–15:30
має створюватися, а не відхилятися.

## What Changes

- **ADDED** `AC-LEAVE-22` — кінець відпустки дорівнює початку наступного блоку: створюється
  один запис 09:00–12:30 тривалістю 3 год, перерва 12:00–12:30 у тривалість не входить.
- **MODIFIED** вимога «Години поза межами розкладу не приймаються» — у реченні SHALL названо,
  що саме вважається межею: кінець у межах, коли він усередині блоку, дорівнює кінцю блоку
  або початку наступного блоку. Сценарії `AC-LEAVE-07` і `AC-LEAVE-19` без змін.
- **MODIFIED** вимога «Тривалість запису за годинами всередині розкладу» — до неї додано
  сценарій `AC-LEAVE-22`. Саме речення SHALL не змінюється: правило «лише хвилини всередині
  блоків» уже було таким, новий AC його не міняє, а доводить на новій межі.

Жодного наявного AC не прибрано й не перенумеровано.

## Capabilities

### Modified Capabilities

- `leave-request` — `openspec/changes/align-leave-3/specs/leave-request/spec.md`

## Users & roles

Працівник — подає заявку на власні посади. Ролі й права не змінюються
(`requirements/product.md`, матриця прав: «Submit a leave request for self» — працівник, із WS6).

## Non-goals

- Початок відпустки на кінці блоку — це й далі помилка (`AC-LEAVE-08`, `AC-LEAVE-20`).
  PM послабив межу лише для кінця.
- Заявка, що виходить за останній блок дня, — не змінюється (`AC-LEAVE-07`, `AC-LEAVE-19`).
- Перерахунок уже створених записів: припущення змінює правило для нових заявок.

## Assumptions

- (PM) «A request may span a gap between schedule blocks; only the minutes inside the blocks
  count. The start and the end must each fall inside a block (the end may equal a block's end
  or the start of the next block, as in AC-LEAVE-22).»
- (розробник) Початок наступного блоку приймаємо як кінець лише тоді, коли він справді є
  початком блоку розкладу цієї посади на цю дату, — не будь-який час після кінця блоку.

## Open questions

Немає: PM назвав і межу, і тривалість, і приклад із числами.
