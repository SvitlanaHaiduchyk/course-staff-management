# Матриця відповідності (AC → код → тест → статус)

<!--
Ваша матриця: один рядок на кожен AC з openspec/specs/** — вашої специфікації, у яку ви перекладаєте вимоги PM
(їхній знімок у requirements/ приносить команда агента /requirements-sync).
Рядок «Вимоги» під цим коментарем заповнює лише /requirements-sync: адреса репо вимог PM, звідки взято вимоги (issues
або файли docs/), і дата знімка, через « · ». Руками його не змінюйте: з нього /requirements-sync знає, звідки брати
вимоги наступного разу, а скіли spec-clarify, spec-review і /conformance — куди ставити питання й яку версію вимог ви
реалізуєте. Рядків таблиці /requirements-sync не додає.
Рядки змінюєте ви:
  PR «Специфікація» — після archive зміни: рядок кожного нового AC зі статусом «відкладено (чекає реалізації)»; рядки AC,
                      прибраних зі специфікації (REMOVED), — видалити;
  PR «Реалізація»   — рядок AC задачі в тому самому PR, що й код і тест.
Перебудувати автоматично: /conformance (Claude Code, Cursor).
Перевірка в CI: npm run ac:coverage — падає, якщо
  NO-ROW     AC є в специфікації, а рядка немає (типово — PR «Специфікація» без нових рядків або рядок видалено);
  MISSING    статус «реалізовано», а непропущеного тесту, назва якого починається з цього AC ID, у файлах
             *.test.ts / *.test.tsx немає (*.spec.ts і допоміжні файли Vitest не запускає — вони не рахуються);
  ORPHAN     тест посилається на AC, якого немає в специфікації (AC прибрано або вимогу PM ще не перекладено);
  BAD-STATUS статус не «реалізовано» і не «відкладено (причина)»;
  WRONG-REF  шляху `src/…`/`tests/…`/`supabase/…` з колонок «Код»/«Тест» немає або тест із цим AC в іншому файлі;
і попереджає, не падаючи: AC з вимог PM (requirements/), якого ще немає в openspec/specs/, — «вимогу PM ще не перекладено
в специфікацію».

Приклад рядків (усередині коментаря — скрипт їх не читає):
| AC-LEAVE-02 | заявка на дві посади дає два записи main і additional | `src/app/requests/actions.ts` (createRequest) | `tests/requests.test.ts` | реалізовано |
| AC-LEAVE-04 | заблоковані дні не рахуються | — | — | відкладено (чекаю відповідь PM на Q2, <pm>/<team-slug>-spec#5) |
| AC-LEAVE-07 | менеджер бачить лише свій відділ | — | — | відкладено (рішення PM: поза зрізом 1, <pm>/<team-slug>-spec#8) |
| AC-LEAVE-10 | діапазон лише із заблокованих днів | — | — | відкладено (чекає реалізації) |
-->

Вимоги: https://github.com/mkozlovskyi-ops/course-staff-management-spec · джерело: docs · знімок 2026-10-26

| AC | Що перевіряє | Код | Тест | Статус |
|---|---|---|---|---|
| AC-LEAVE-01 | Цілий день на одній посаді | `src/lib/leave/build.ts` (buildRecords) | `tests/leave-request.test.ts` | реалізовано |
| AC-LEAVE-02 | Цілий день на двох посадах дає два записи | `src/lib/leave/build.ts` (buildRecords) | `tests/leave-request.test.ts` | реалізовано |
| AC-LEAVE-03 | Виключена посада запису не створює | `src/lib/leave/build.ts` (buildRecords) | `tests/leave-request.test.ts` | реалізовано |
| AC-LEAVE-05 | Кілька дат дають по запису на дату | `src/lib/leave/build.ts` (buildRecords) | `tests/leave-request.test.ts` | реалізовано |
| AC-LEAVE-04 | Години в межах одного блоку | `src/lib/leave/schedule.ts` (minutesInsideBlocks) | `tests/leave-schedule.test.ts` | реалізовано |
| AC-LEAVE-15 | Заявка через перерву між блоками | `src/lib/leave/schedule.ts` (minutesInsideBlocks) | `tests/leave-schedule.test.ts` | реалізовано |
| AC-LEAVE-06 | Субота поза розкладом | `src/lib/leave/validate.ts` (validateHours) | `tests/leave-schedule.test.ts` | реалізовано |
| AC-LEAVE-07 | Початок раніший за розклад | `src/lib/leave/validate.ts` (outsideScheduleMessage) | `tests/leave-schedule.test.ts` | реалізовано |
| AC-LEAVE-08 | Початок дорівнює кінцю блоку | `src/lib/leave/validate.ts` (endOfWorkingTimeMessage) | `tests/leave-schedule.test.ts` | реалізовано |
| AC-LEAVE-09 | Кінець раніший за початок | `src/lib/leave/validate.ts` (validateHours) | `tests/leave-schedule.test.ts` | реалізовано |
| AC-LEAVE-10 | Усі посади виключено | `src/lib/leave/build.ts` (buildRecords) | `tests/leave-request.test.ts` | реалізовано |
| AC-LEAVE-11 | Повернення зі зведення до редагування | `src/lib/leave/build.ts` (buildRecords) | `tests/leave-request.test.ts` | реалізовано |
| AC-LEAVE-12 | Family celebration без спорідненості | `src/lib/leave/build.ts` (RELATIONSHIP_REQUIRED) · `leave_requests_relationship_check` | `tests/leave-request.test.ts` · `tests/db/submit-request.test.ts` | реалізовано |
| AC-LEAVE-13 | Перетин на одній даті | `src/lib/leave/overlap.ts` (findOverlap) · `submit_leave_request` | `tests/leave-request.test.ts` · `tests/db/submit-request.test.ts` | реалізовано |
| AC-LEAVE-16 | Перетин на одній даті скасовує всю заявку | `src/lib/leave/overlap.ts` (findOverlap) · `submit_leave_request` (ADR 0001) | `tests/leave-request.test.ts` · `tests/db/submit-request.test.ts` | реалізовано |
| AC-LEAVE-14 | Список містить лише власні записи | `supabase/migrations/20261020203434_leave_schema.sql` (політика leave_records_select) + `src/app/requests/page.tsx` | `tests/db/rls.test.ts` | реалізовано |
| AC-DECIDE-01 | Список обмежено своїми посадами | `supabase/migrations/20261026201058_leave_decisions.sql` (leave_records_select, decides_record) · `src/app/decisions/` | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-14 | Порожній список має власне повідомлення | `src/lib/leave/decision.ts` (NO_RECORDS_AWAITING) · `src/app/decisions/` | `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-02 | Погодження одного запису із двох | `supabase/migrations/20261026201058_leave_decisions.sql` (decide_leave_record) · `src/app/decisions/` | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-03 | Відхилення запису | `supabase/migrations/20261026201058_leave_decisions.sql` (decide_leave_record) · `src/app/decisions/` | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-11 | Вирішений запис переходить в історію | `supabase/migrations/20261026201058_leave_decisions.sql` (leave_decisions) · `src/app/decisions/` | `tests/db/decisions.test.ts` | реалізовано |
| AC-DECIDE-04 | Повернення без коментаря | `supabase/migrations/20261026201058_leave_decisions.sql` (leave_decisions_return_needs_comment_check) · `src/lib/leave/decision.ts` (RETURN_NEEDS_COMMENT) | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-05 | Повернення з коментарем | `supabase/migrations/20261026201058_leave_decisions.sql` (decide_leave_record) · `src/app/decisions/` | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-06 | Виправлення годин і повторне подання | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-07 | Другий менеджер тієї самої посади | `supabase/migrations/20261026201058_leave_decisions.sql` (leave_records_update_decision) · `src/lib/leave/decision.ts` (alreadyDecidedMessage) | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-08 | Менеджер чужої посади | `supabase/migrations/20261026201058_leave_decisions.sql` (private.decides_record) · `src/lib/leave/decision.ts` (canDecide) | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-09 | Працівник погоджує власний запис | `supabase/migrations/20261026201058_leave_decisions.sql` (private.decides_record) · `src/lib/leave/decision.ts` (canDecide) | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-10 | Адміністратор погоджує запис чужої посади | `supabase/migrations/20261026201058_leave_decisions.sql` (private.decides_record) · `src/lib/leave/decision.ts` (canDecide) | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-18 | Менеджер власної посади й власний запис | `supabase/migrations/20261026201058_leave_decisions.sql` (private.decides_record) · `src/lib/leave/decision.ts` (OWN_RECORD_NEEDS_ADMIN) | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-19 | Адміністратор вирішує запис менеджера | `supabase/migrations/20261026201058_leave_decisions.sql` (private.decides_record) · `src/lib/leave/decision.ts` (canDecide) | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-12 | Спроба змінити погоджений запис | `supabase/migrations/20261020203434_leave_schema.sql` (політика leave_records_update_own_awaiting) | — | відкладено (база вже не дає змінити погоджений запис — тест у tests/db/rls.test.ts; бракує повідомлення «This record is already approved and cannot be changed», бо екран рішень — зріз leave-decision) |
| AC-DECIDE-16 | Зміна годин до рішення | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-13 | Скасування запису, що чекає рішення | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-17 | Скасування поверненого запису | — | — | відкладено (чекає реалізації) |
| AC-DECIDE-15 | Рядок історії після погодження | `supabase/migrations/20261026201058_leave_decisions.sql` (leave_decisions, require_decision_trail) · `src/app/decisions/` | `tests/db/decisions.test.ts` | реалізовано |
| AC-BALANCE-01 | Залишки на початку навчального року | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-02 | Цілий день єдиної посади | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-05 | Цілий день двох посад рахується як один день | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-03 | Години на єдиній посаді | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-06 | Цілий день лише додаткової посади | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-04 | Запис, що чекає рішення, балансу не чіпає | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-07 | Відхилений запис балансу не чіпає | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-11 | Перенесення 5.00 днів | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-08 | Перевищення цілим днем | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-15 | Перевищення часткою дня | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-09 | Попередження на цілий день | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-14 | Залишок береться на момент рішення | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-10 | Поділ 0.50 і 0.50 | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-16 | Спроба погодити без поділу | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-12 | Менеджер чужих посад | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-13 | Працівник і чужі залишки | — | — | відкладено (чекає реалізації) |
| AC-LEAVE-19 | Розклад із двох блоків у повідомленні | `src/lib/leave/validate.ts` (outsideScheduleMessage) | `tests/leave-schedule.test.ts` | реалізовано |
| AC-LEAVE-20 | Початок на кінці першого блоку з двох | `src/lib/leave/validate.ts` (validateHours) | `tests/leave-schedule.test.ts` | реалізовано |
| AC-LEAVE-17 | Коментар зберігається на всіх записах заявки | `src/lib/leave/build.ts` (buildRecords) | `tests/leave-request.test.ts` | реалізовано |
| AC-LEAVE-18 | Коментар довший за 500 символів | `src/lib/leave/build.ts` (COMMENT_TOO_LONG) | `tests/leave-request.test.ts` | реалізовано |
| AC-DECIDE-22 | Зміна, що перетинає інший запис посади | `src/lib/leave/overlap.ts` (findOverlap, excludeId) | `tests/leave-request.test.ts` | реалізовано |
| AC-DECIDE-20 | Коментар видно менеджерові | `supabase/migrations/20261026201058_leave_decisions.sql` (leave_requests_select_managed) · `src/app/decisions/` | `tests/db/decisions.test.ts` | реалізовано |
| AC-DECIDE-21 | Спроба змінити тип відпустки | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-17 | Одне попередження на заявку з кількох дат | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-18 | Поділений запис лишається одним записом | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-19 | Нульовий залишок | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-20 | Менеджер додаткової посади бачить повний баланс | — | — | відкладено (чекає реалізації) |
| AC-LEAVE-21 | Неробоча дата відпадає, решта дат лишаються | `src/lib/leave/build.ts` (buildRecords) | `tests/leave-request.test.ts` | реалізовано |
| AC-DECIDE-23 | Відхилення з коментарем | `supabase/migrations/20261026201058_leave_decisions.sql` (decide_leave_record) · `src/app/decisions/` | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-DECIDE-24 | Погодження з коментарем | `supabase/migrations/20261026201058_leave_decisions.sql` (decide_leave_record) · `src/app/decisions/` | `tests/db/decisions.test.ts` · `tests/leave-decision.test.ts` | реалізовано |
| AC-BALANCE-21 | Пізнє погодження за минулий навчальний рік | — | — | відкладено (чекає реалізації) |
| AC-BALANCE-22 | Заявка через межу навчальних років | — | — | відкладено (чекає реалізації) |
