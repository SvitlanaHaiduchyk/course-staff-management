# Задачі зрізу leave-balance

Кожна задача — вертикальний зріз і окремий PR «Реалізація» з гілкою `task/<коротко>`. Галочки ставимо в PR задачі; archive зміни — в останньому PR зрізу.

## 1. Частка дня й навчальний рік — чисті функції

Арифметика зрізу без бази: частка дня з хвилин і розкладів усіх посад, навчальний рік за датою запису, складання балансу. Найщільніше місце зрізу на числа, тож робимо його першим і окремо — щоб `AC-BALANCE-03`, `-05`, `-06` мали тести ще до будь-якої міграції.

- [ ] `src/lib/leave/balance.ts` — `workingMinutesOn`, `dayShare` (half up до 0.01), `schoolYearOf`, `sumShares`
- [ ] там само — `balanceRow` (надано, перенесено, використано, залишилось) і `suggestedSplit`
- [ ] тексти PM: `overBalanceWarning`, `managerSplitWarning`, `approveNeedsSplit`, `splitLabel`
- [ ] `tests/leave-balance.test.ts` — числа з прикладів PM: 420/420, 150/420, 495/495, 75/495

Done when: AC-BALANCE-02, AC-BALANCE-03, AC-BALANCE-05, AC-BALANCE-06, AC-BALANCE-22

## 2. Схема: перенесення, поділ і доступ до чужих залишків

Міграція з таблицею `leave_carryover`, колонками `days_on_type` / `days_unpaid` на `leave_records`, хелпером `private.manages_employee` і трьома політиками `select`, без яких менеджер не порахує повного балансу (`AC-BALANCE-20`).

- [x] Міграція `*_leave_balance.sql`: таблиця, колонки, RLS, `grant`, `private.manages_employee`, політики на `leave_records`, `positions`, `schedule_blocks`
- [x] `public.employee_balance(p_employee_id uuid, p_school_year smallint)` — `security invoker`
- [x] `supabase/demo-carryover.json` і `scripts/create-demo-carryover.mjs` (`npm run carryover:demo`)
- [x] `tests/db/balance-access.test.ts` — відмовні AC на рівні бази

Done when: AC-BALANCE-11, AC-BALANCE-12, AC-BALANCE-13, AC-BALANCE-20, AC-BALANCE-21

## 3. Погодження з поділом

Нова міграція `create or replace` для `public.decide_leave_record`: четвертий параметр `p_days_unpaid`, розрахунок частки й залишку на момент рішення, відмова в погодженні понад залишок без поділу. Екран рішень показує попередження й підказаний поділ.

- [x] Міграція `*_decide_with_split.sql`: нова версія `decide_leave_record`, запис `days_on_type` і `days_unpaid`
- [ ] `src/app/decisions/` — попередження з підказаним поділом, погодження з поділом
- [x] `tests/db/decide-split.test.ts` — поділ, нульовий залишок, відмова без поділу

Done when: AC-BALANCE-04, AC-BALANCE-07, AC-BALANCE-09, AC-BALANCE-10, AC-BALANCE-14, AC-BALANCE-16, AC-BALANCE-19

## 4. Сторінка залишків і попередження працівникові

Сторінки `/balances` і `/balances/[employeeId]`, попередження при поданні заявки (одне на заявку) і показ поділу на погодженому записі.

- [ ] `src/app/balances/` — таблиця залишків за чотирма типами
- [ ] `src/app/requests/` — попередження `Alert` варіанта `default` при поданні; поділ на записі
- [ ] посилання в навігації
- [ ] `tests/leave-balance.test.ts` — доповнити текстами попереджень

Done when: AC-BALANCE-01, AC-BALANCE-08, AC-BALANCE-15, AC-BALANCE-17, AC-BALANCE-18

## 5. Завершення зрізу

- [ ] `/conformance` і `npm run ac:coverage` — рядки 22 AC оновлено в тих самих PR, що й код
- [ ] ADR, якщо рішення «зберігаємо частку, а не перераховуємо» виявиться спірним у рев'ю
- [ ] Після merge — `db-deploy` зелений, зріз працює на прод-URL
- [ ] `npx openspec archive impl-leave-balance -y` в останньому PR зрізу

Done when: усі 67 AC у `docs/conformance.md` мають статус, відмінний від «відкладено (чекає реалізації)»
