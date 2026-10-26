# Задачі зрізу leave-decision

Кожна задача — вертикальний зріз і окремий PR «Реалізація» з гілкою `task/<коротко>`. Галочки ставимо в PR задачі; archive зміни — в останньому PR зрізу.

## 1. Рішення менеджера: база, дія, сторінка

Міграція з таблицею `leave_decisions`, хелпером `private.decides_record`, колонковим `grant update (status)`, окремою політикою `update` на рішення і функцією `public.decide_leave_record`. Сторінка `/decisions` зі списками «Awaiting decision» і «History», серверна дія з `getClaims()` і перевіркою ролі до запису.

- [x] Міграція `*_leave_decisions.sql`: таблиця, RLS, `grant`, політики, `private.decides_record`, `public.decide_leave_record`
- [x] `src/lib/leave/decision.ts` — чисті правила: які рішення можливі, коли коментар обов'язковий, тексти повідомлень PM
- [x] `src/app/decisions/page.tsx` і `actions.ts` — список, діалог підтвердження, дія `decide` з `getClaims()`
- [x] Посилання на `/decisions` у шапці — лише для ролей `manager` і `admin` (UX, не захист)
- [x] `tests/db/decisions.test.ts` — відмовні AC на рівні бази (PGlite, `asUser`)
- [x] `tests/leave-decision.test.ts` — правила й тексти повідомлень

Done when: AC-DECIDE-01, AC-DECIDE-02, AC-DECIDE-03, AC-DECIDE-04, AC-DECIDE-05, AC-DECIDE-07, AC-DECIDE-08, AC-DECIDE-09, AC-DECIDE-10, AC-DECIDE-11, AC-DECIDE-14, AC-DECIDE-15, AC-DECIDE-18, AC-DECIDE-19, AC-DECIDE-20, AC-DECIDE-23, AC-DECIDE-24

## 2. Працівник після рішення: години, скасування, повторне подання

Міграція, що розширює політику оновлення власного запису на `cancelled` і повторне подання, і функція `public.update_record_hours` з перевіркою перетину без самого себе. Сторінка «My requests» показує статус, коментар менеджера й дає три дії.

- [ ] Міграція `*_record_hours_and_cancel.sql`: `drop policy` + нова `leave_records_update_own_pending`, `public.update_record_hours`
- [ ] `src/lib/leave/overlap.ts` — `findOverlap` з `excludeId` уже є; додати правила «що можна змінити» з текстами PM
- [ ] `src/app/requests/page.tsx` і `actions.ts` — статус, коментар менеджера, зміна годин, скасування, повторне подання
- [ ] `tests/db/record-edit.test.ts` — відмовні AC на рівні бази
- [ ] `tests/leave-decision.test.ts` — доповнити правилами працівника

Done when: AC-DECIDE-06, AC-DECIDE-12, AC-DECIDE-13, AC-DECIDE-16, AC-DECIDE-17, AC-DECIDE-21, AC-DECIDE-22

## 3. ADR і прод

- [ ] ADR про те, де живе перевірка прав на рішення (роль із `profiles` + хелпер у `private`, а не роль із токена)
- [ ] `/conformance` і `npm run ac:coverage` — рядки 24 AC зрізу оновлено в тих самих PR, що й код
- [ ] Після merge — `db-deploy` зелений, зріз працює на прод-URL
- [ ] Скріни за ролями (працівник, менеджер, адміністратор) у `docs/img/`
- [ ] `npx openspec archive impl-leave-decision -y` в останньому PR зрізу

Done when: усі 24 AC зрізу мають статус у `docs/conformance.md`, відмінний від «відкладено (чекає реалізації)»
