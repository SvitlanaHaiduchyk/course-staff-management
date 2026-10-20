# Задачі зрізу leave-request

Кожна задача — вертикальний зріз і окремий PR «Реалізація» з гілкою `task/<коротко>`.

## 1. Схема й доменні правила годин

Міграція з ролями `employee` / `manager` / `admin` і таблицями `divisions`, `positions`, `position_managers`, `schedule_blocks`, `leave_requests`, `leave_records` — з RLS, явними `grant` і політикою на кожну операцію. Чисті функції `src/lib/leave/`: розклад дня, перевірка годин, хвилини всередині блоків.

- [x] Міграція `*_leave_schema.sql`: ролі, шість таблиць, RLS, `grant`, політики
- [x] `src/lib/leave/schedule.ts` — `scheduleFor`, `minutesInsideBlocks`
- [x] `src/lib/leave/validate.ts` — `validateHours` з текстами повідомлень PM
- [x] `tests/leave-schedule.test.ts` — тести з AC ID на початку назв

Done when: AC-LEAVE-04, AC-LEAVE-06, AC-LEAVE-07, AC-LEAVE-08, AC-LEAVE-09, AC-LEAVE-15, AC-LEAVE-19, AC-LEAVE-20

## 2. Побудова записів заявки

Чисті функції, що з введення працівника роблять записи: по одному на включену посаду на кожну дату, з перевірками «жодної посади», ступеня спорідненості й довжини коментаря.

- [x] `src/lib/leave/build.ts` — `buildRecords`
- [x] `src/lib/leave/overlap.ts` — `overlaps`, перевірка «вся заявка або нічого»
- [x] `tests/leave-request.test.ts` — тести з AC ID

Done when: AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-03, AC-LEAVE-05, AC-LEAVE-10, AC-LEAVE-12, AC-LEAVE-13, AC-LEAVE-16, AC-LEAVE-17, AC-LEAVE-18

## 3. Серверна дія і список «My requests»

Функція Postgres `submit_leave_request` для атомарності, серверна дія поверх неї, сторінка зі списком власних записів.

- [ ] Міграція `*_submit_leave_request.sql` — функція `security invoker`
- [ ] `src/app/requests/actions.ts` — `submitLeaveRequest`
- [ ] `src/app/requests/page.tsx` — «My requests»
- [ ] `supabase/demo-users.json` — тестові працівники, посади й розклади

Done when: AC-LEAVE-11, AC-LEAVE-14

## 4. Рішення менеджера (наступний зріз)

Не входить у цю зміну: 19 AC можливості `leave-decision`.

Done when: AC-DECIDE-01 … AC-DECIDE-22

## 5. Залишки (наступний зріз)

Не входить у цю зміну: 20 AC можливості `leave-balance`.

Done when: AC-BALANCE-01 … AC-BALANCE-20
