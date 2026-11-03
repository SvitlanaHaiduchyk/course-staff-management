# QA proof pack: зріз 2 — рішення менеджера по записах відпустки

<!--
Шаблон з koldovsky/2026-quitcode-08-quality-hw/materials/templates/proof-pack.template.md.
Заповнюється по кроках WS8 (A → B → C → D). Жодних паролів; акаунти — лише адреси *@example.test.
-->

- Прод-URL: <https://course-staff-management.vercel.app>
- Вимоги: https://github.com/mkozlovskyi-ops/course-staff-management-spec · джерело: docs · знімок 2026-10-26
- `/api/health` на момент здачі: sha `f685439`, db `ok`, env `production`, 02.11.2026

## 3 AC

| AC | Вид | «Тоді» (дослівно з вимоги PM) |
|---|---|---|
| `AC-DECIDE-04` | стан інтерфейсу: помилка | «the status does not change, and the manager sees the message **"Tell the employee what to fix"**» |
| `AC-DECIDE-14` | стан інтерфейсу: порожній стан | «the manager sees the message **"No records awaiting decision"**» |
| `AC-BALANCE-13` | відмова в браузері: чужі дані за прямим посиланням | «teacher1@example.test tries to view another employee's balances. Then **the balances are not shown**» |

**Чому третій AC — з вимоги про залишки, а не зі зрізу 2.** Рубрика просить щонайменше одну відмову, яку **видно в браузері**. У зрізі 2 таких немає: інтерфейс не малює кнопок, яких людині не можна натиснути (власний запис менеджера відфільтровано зі списку), тож `AC-DECIDE-09` і `AC-DECIDE-18` досяжні лише прямим POST — а його PM руками не прогоняє. `AC-BALANCE-13` — єдина наша відмова, яку видно просто за URL: `/balances/<чужий id>`.

## A. Ворота

- PR воріт: [#37](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/37)
- D0: [#36](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/36)
- Обов'язкові перевірки в `solo-main`: **ще не додано** — додаємо після першого зеленого прогону `quality` на `main`.

Розбір першого повного прогону `fallow` — таблиця в описі [#37](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/37): дві справжні знахідки виправлено (`toTime`, друга копія `RecordStatus`), три файли лишено з причиною **в самому файлі**, решта — успадкована й не гейтиться.

**Що знайшли ворота:** правило `vitest/require-to-throw-message` показало **24** відмовні тести з голим `toThrow()` — вони були б зелені й на одруківці в SQL. Серед них `AC-DECIDE-09` падав із повідомленням `AC-DECIDE-18`.

## B. Якість тестів

### Рівень для кожного AC

| AC | Де живе правило | Рівень | Чому | Тест |
|---|---|---|---|---|
| `AC-DECIDE-04` | **дві лінії:** `checkDecision` у TS і обмеження `leave_decisions_return_needs_comment_check` у базі | unit **і** база (PGlite) | Текст повідомлення — чиста функція, її дешево перевіряти unit-тестом. Але правило дублюється в базі, і саме там воно лишається, якщо обійти серверну дію. Один рівень не доводить обох. | [unit](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/leave-decision.test.ts#L56) · [база](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/db/decisions.test.ts#L211) |
| `AC-DECIDE-14` | константа `NO_RECORDS_AWAITING` у TS + умова на сторінці | unit (текст) + e2e (що його видно) | Порожній стан — це «який текст» і «коли його показано». Перше перевіряє unit; друге видно лише в браузері, бо залежить від порожнього списку після RLS. | [unit](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/leave-decision.test.ts#L132) · e2e — завдання C |
| `AC-BALANCE-13` | `private.may_see_balance` у базі | **база (PGlite)** | Правило живе в SQL і більше ніде. TS-копії немає й не має бути: перевірка в сторінці була б другою правдою, яку легко розсинхронізувати. Тест на замоканому `rpc` тут не довів би нічого. | [база](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/db/balance-access.test.ts#L258) |

### Покриття

`npm run test:coverage` (пороги на файл — `vitest.coverage.config.mts`).

| Файл за AC | Рядки | Гілки | Чим доведено, якщо 0 % |
|---|---|---|---|
| `src/lib/leave/decision.ts` | 100 % | 100 % | — |
| `src/lib/leave/balance.ts` | 97.67 % | 95.45 % | — |
| `src/app/decisions/page.tsx` | 0 % | 0 % | база: політики `leave_records_select_*` (`tests/db/decisions.test.ts`); сторінку доведе e2e (завдання C) |
| `src/app/balances/[employeeId]/page.tsx` | 0 % | 0 % | база: `private.may_see_balance` (`tests/db/balance-access.test.ts`); e2e — завдання C |
| `src/app/decisions/actions.ts` | 0 % | 0 % | те саме: правило в базі, дія лише передає рішення |

**Порога на загальний відсоток немає свідомо** (зараз ≈40 %). Сторінки й server actions доводять тести бази і UAT, а не Vitest: 0 % у них — не прогалина, а інший рівень доказу.

### Доказ мутацією

**TypeScript — Stryker** (`npm run mutation:ts -- --mutate src/lib/leave/decision.ts`): **76.60 % → 100 %**, вижилих **22 → 0**. Жодного мутанта не прибрано й не вимкнено.

| Мутант (файл:рядок, що змінено) | AC під загрозою | До | Тест, посилений з тексту AC | Після |
|---|---|---|---|---|
| `decision.ts:130` `comment === null` → `false` | `AC-DECIDE-04` | вижив | [tests/leave-decision.test.ts#L56](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/leave-decision.test.ts#L56): «без коментаря» з AC — це і порожнє поле (`null`), і самі пробіли | убитий |
| `decision.ts:122` `viewer.role !== "admin"` → `true` | `AC-DECIDE-19` | вижив | [#L132](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/leave-decision.test.ts#L132): адміністратор вирішує й власний запис — через `checkDecision`, а не лише `canDecide` | убитий |
| `decision.ts:126–127` гілка `!canDecide` (5 мутантів) | `AC-DECIDE-08` | вижили | [#L118](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/leave-decision.test.ts#L118): менеджер чужої посади отримує дослівне «You cannot decide on this record» | убиті |
| `decision.ts:32–38` гілки `statusLabel` | `AC-DECIDE-03` | вижили | [#L140](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/leave-decision.test.ts#L140): усі п'ять статусів і `default`, а не вибірково | убиті |

**SQL — `npm run mutation:sql`** (PGlite-гарнес, `scripts/mutants.mjs`): **5 із 5 убито**.

| Мутант | AC | Що зламано | Результат |
|---|---|---|---|
| `D1` | `AC-DECIDE-01` | політика `select`: менеджер бачить записи будь-якої посади | KILLED |
| `D2` | `AC-DECIDE-04` | обмеження: повернення приймається без коментаря | **спершу SURVIVED** → KILLED |
| `B1` | `AC-BALANCE-13` | `private.may_see_balance` → `true` | KILLED |
| `B2` | `AC-BALANCE-20` | область менеджера: відповідальний за будь-кого | KILLED |
| `P1` | самопідвищення ролі | колонковий `grant` пускає `role` | KILLED |

**Найцінніше тут — `D2`.** Він вижив: обмеження бази для `AC-DECIDE-04` не доводив **жоден** тест. Усі йшли через `decide_leave_record`, а функція відмовляє **до** вставки, тож обмеження можна було видалити непоміченим. Додано [тест, що б'є в таблицю напряму](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/8b367b49ccc9a827a66b66a50baf2eeb8ec2ba6c/tests/db/decisions.test.ts#L211) — повз функцію.

- Еквівалентні мутанти: немає.
- Правило `private.decides_record` (`AC-DECIDE-09`, `AC-DECIDE-18`) окремим мутантом не беремо: у файлі два схожі заголовки функцій, і заміна тіла блоком ненадійна. Те саме правило тримає `B2`, а ручні прогони є в описах [#25](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/25) і [#28](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/28).

## C. UAT на проді

Ще не зроблено — завдання C.

### Приймання PM

Ще не зроблено.

## D. Eval рецензента

Ще не зроблено — завдання D.
