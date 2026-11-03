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

| AC | Специфікація | Тест | Агент | Вердикт | Кадр |
|---|---|---|---|---|---|
| `AC-DECIDE-04` | [`decisions-return-no-comment.spec.ts`](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/b5b009dcf3018f06ffe1ec7ee281d322409add50/tests/e2e/decisions-return-no-comment.spec.ts) | passed | Haiku: PASS | **PASS** (R6) | [`AC-DECIDE-04-then-1.png`](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/b5b009dcf3018f06ffe1ec7ee281d322409add50/docs/qa/uat/2026-11-03/frames/AC-DECIDE-04-then-1.png) |
| `AC-DECIDE-14` | [`decisions-empty.spec.ts`](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/b5b009dcf3018f06ffe1ec7ee281d322409add50/tests/e2e/decisions-empty.spec.ts) | passed | Haiku: PASS | **PASS** (R6) | [`AC-DECIDE-14-then-1.png`](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/b5b009dcf3018f06ffe1ec7ee281d322409add50/docs/qa/uat/2026-11-03/frames/AC-DECIDE-14-then-1.png) |
| `AC-BALANCE-13` | [`balances-forbidden.spec.ts`](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/b5b009dcf3018f06ffe1ec7ee281d322409add50/tests/e2e/balances-forbidden.spec.ts) | passed | Haiku: PASS | **PASS** (R6) | [`AC-BALANCE-13-then-1.png`](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/b5b009dcf3018f06ffe1ec7ee281d322409add50/docs/qa/uat/2026-11-03/frames/AC-BALANCE-13-then-1.png) |

- Звіт: [`docs/qa/uat/2026-11-03/report.md`](https://github.com/SvitlanaHaiduchyk/course-staff-management/blob/b5b009dcf3018f06ffe1ec7ee281d322409add50/docs/qa/uat/2026-11-03/report.md) · прод на коміті `7503be9`, `/api/health` → `db: ok`
- Рецензент: `claude-haiku-5-5`, суперечки → `claude-sonnet-5-5`; за розбір $0.0057
- Дані: `AC-DECIDE-14` і `AC-BALANCE-13` — лише читання. `AC-DECIDE-04` має тег `@writes`: засіває один запис і прибирає його за собою (`afterAll`); у звіті рядок «Прибирання» — 0 залишків.
- Негативний контроль: `NC-1` (`AC-DECIDE-14`, навмисно хибне очікування) → **FAIL** за правилом R1.

### UAT знайшов баг, якого не бачив жоден тест

Перший же прогін проти прода показав, що сторінка `/decisions` **завжди** віддавала «No records awaiting decision», хоч записи на розгляді в базі були. Запит падав:

> `Could not embed because more than one relationship was found for 'positions' and 'profiles'`

PostgREST бачить **два** шляхи між `positions` і `profiles`: прямий FK `employee_id` і «багато-до-багатьох» через `position_managers`. Помилка ковталася, `awaiting` ставало `null`, і малювався порожній стан.

**Менеджер не міг ухвалити жодного рішення на проді** — увесь зріз 2 був непрацездатний у браузері, хоч усі 24 його AC позначені «реалізовано».

Чому не впіймав жоден наявний тест:

- тести бази на PGlite ходять через **SQL**, а ця помилка існує лише в **PostgREST**;
- сторінки мають 0 % покриття Vitest — і в таблиці покриття вище чесно написано «доведено базою і e2e». Доти e2e не було, тож половина доказу була обіцянкою.

Виправлено явним FK (`profiles!positions_employee_id_fkey`) у PR [#44](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/44).

**Друга знахідка:** `AC-DECIDE-04` був недосяжний у браузері — поле коментаря мало `required`, тож браузер блокував порожню форму **своїм** повідомленням, і текст PM «Tell the employee what to fix» не з'являвся ніколи.

### Що показав негативний контроль

`NC-1` бере правильне «Тоді» `AC-DECIDE-14`, але хибне твердження в коді. Результат:

- перевірка Playwright — **впала** (правильно: хибного тексту на сторінці немає);
- агент — **PASS**: кадр справді відповідає критерію, і він це чесно побачив;
- підсумок — **FAIL** за правилом R1: впала перевірка не перекривається агентом.

Тобто від хибного PASS захищає **код правил вердикту**, а не судження агента. Якби вердикт рахував агент, цей випадок пройшов би.

### Приймання PM

Три AC написано в чат команди. Рішення PM чекаємо до кінця Нд 08.11.

| AC | Рішення PM | Посилання |
|---|---|---|
| `AC-DECIDE-04` | очікується | — |
| `AC-DECIDE-14` | очікується | — |
| `AC-BALANCE-13` | очікується | — |

## D. Eval рецензента

- PR з вадами: [#39](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/39) — **помилково злитий** замість закриття (див. нижче)
- Ключ і таблиця: [коментар у #39](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/39#issuecomment-6595321361), опубліковано **після** того, як обидва рецензенти відпрацювали
- Правило, що закриває пропуск: [#40](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/40)
- Повторний прогін: [#42](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/42) — **не зливати**

Три вади пройшли **всі обов'язкові перевірки** (`app`, `spec`, `conformance`, `db-check`, обидва архітектурні ворота, покриття) — саме такі зміни й доходять до рецензента.

| # | Вада (ключ) | CodeRabbit | `/code-review high` |
|---|---|---|---|
| 1 | авторизація: `getClaims()` → `getSession()` у `decideRecord` | **знайшов**, Major · Security — «`getSession()` читає сесію з cookie, якими керує клієнт. Її `user.id` не можна використовувати для серверної авторизації… RLS окремо захищає запити до бази, але не виправляє серверну перевірку» | **знайшов** — «після відкликання сесії `getSession()` ще повертає старого користувача, тож звільнений менеджер ще ухвалює рішення» |
| 2 | права в даних: `security definer` без `set search_path = ''` | **знайшов**, Minor · Security — «Функція успадковує `search_path` виклику… ризик виконання коду з правами власника функції» | **знайшов** — «тамішня таблиця `profiles` підмінить справжню, і запит виконається з підвищеними правами» |
| 3 | логіка: `share > remaining` → `>=` (межа з `AC-BALANCE-08`) | **пропустив** | **знайшов** — «інтерфейс і база тепер розходяться на цій межі: `decide_leave_record` лишилася зі строгим `v_share > v_remaining`» |
| П | приманка: винесення `viewer.role === "admin"` у `isAdmin` | **без хибної тривоги** — «`canDecide` і `checkDecision` використовують локальний `isAdmin`; **результат перевірок ролі не змінено**» | **без хибної тривоги** — назвав поведінку незмінною, зазначив лише, що `canDecide` втратив док-коментар |

### Як саме CodeRabbit пропустив ваду 3

Він її **побачив і описав** — нейтрально, як задум: «`exceedsBalance` повертає `true`, коли частка дорівнює залишку або перевищує його». А в перевірці перед злиттям **запропонував закріпити хибну поведінку тестом**:

> `it("AC-BALANCE-08: рівний залишок є перевищенням", () => { expect(exceedsBalance(100, 100)).toBe(true); })`

Тобто порадив назвати тестом саме той AC, який ця зміна порушує. Це гірше за простий пропуск: виконання поради зробило б ваду «доведеною» й закрило б її від майбутніх рев'ю.

### Інші знахідки

| Хто | Знахідка | Оцінка |
|---|---|---|
| `/code-review` | нову функцію бази ніхто не кличе | **слушна** — мертвий код; саме тому її видалили, а не полагодили |
| `/code-review` | `canDecide` втратив док-коментар | **слушна**, дрібна |
| CodeRabbit | попередження «AC ID у тестах і матриці відповідності» | **слушна за формою**, але порада хибна: пропонує тест, що закріплює ваду 3 |

### Правило й повторний прогін

Правило — у розділі «Межі» `AGENTS.md` ([#40](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/40)): оператор порівняння на межі з AC — частина вимоги; заміна `>` ↔ `>=` без нового AC від PM — «must fix» навіть із зеленими тестами; «закріпити» нову поведінку тестом зі старим AC ID не можна.

Повторний прогін — [#42](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/42): та сама вада, те саме маскування, але правило вже в `AGENTS.md`.

**Результат: цього разу CodeRabbit ваду зловив** — Major · Functional Correctness:

> **Поверніть строгу межу `>` для відповідності AC-BALANCE-08.** За `share === remaining` `src/app/decisions/page.tsx` тепер створює хибне попередження менеджеру, але процедура схвалення в `…decide_with_split.sql` вимагає split лише за `v_share > v_remaining`. Це також порушує AC: заявка рівно на залишок не є перевищенням. **Видалення тесту `AC-BALANCE-08` не змінює вимогу.**

Знахідка точна в трьох речах, яких у першому прогоні не було: названо сам AC, помічено розходження між інтерфейсом і базою, і окремо сказано, що прибраний тест вимоги не скасовує.

**Чесне застереження про причину.** Приписати це нашому правилу не можна. У першому прогоні знахідки CodeRabbit посилалися на «coding guidelines» і «path instructions» — тобто на `AGENTS.md`. А тут джерело вказано як **«Learnings»**: його власна пам'ять із попереднього PR, де я в коментарі пояснила цю саму ваду. Правило й навчання спрацювали одночасно, і розділити їх цим експериментом неможливо. Щоб перевірити саме правило, потрібен був би чистий рецензент без пам'яті про #39.

PR #42 закрито без злиття — у ньому навмисна вада.

### Що пішло не так із самим eval

**PR #39 мали закрити після рев'ю, а його злили.** Пишу як є; за рубрикою злитий PR із вадами не зараховують.

Наслідки й виправлення ([#41](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/41)):

1. `getSession()` і межа `>=` побували в `main` і на проді ≈1 годину.
2. `db-deploy` **застосував** міграцію з `security definer` без `search_path` у продакшн-базу. Прибрано новою міграцією (застосовану не редагуємо): функцію **видалено**, бо її ніхто не кликав — найменша поверхня ризику.
3. Додано тест на межу `exceedsBalance(100, 100) === false`. Саме його відсутність і зробила ваду 3 невидимою для CI.

**Висновок для конвеєра WS9:** вада, яку не ловлять ні ворота, ні два рецензенти, ловиться мутацією — Stryker убив би цей мутант. Але Stryker не в обов'язкових перевірках, бо повільний. Отже, для AC з числовою межею тест на саму межу обов'язковий, і це тепер записано правилом.
