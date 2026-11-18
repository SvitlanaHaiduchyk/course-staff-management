# Задачі зрізу calendar-assistant

Кожна задача — вертикальний зріз і окремий PR «Реалізація» з гілкою `task/<коротко>`. Галочки ставимо в PR задачі; archive зміни — в останньому PR зрізу.

Порядок не випадковий: задача 0 вже злита й дала чисті функції, на яких тримається все інше; задача 1 — екран із пропозиціями, бо без нього помічника не видно; задача 2 — збереження, найтонше місце зрізу (`AC-ASSIST-04` вимагає часткового успіху); задачі 3 і 4 — докази, яких вимагає зріз із моделлю; задача 5 — прод і приймання.

## 0. Ядро помічника — схема, промпт, стани

Злито в PR #73 разом з ADR 0003 і залежностями.

- [x] `src/lib/ai/schema.ts` — три стани, масив пропозицій, «невідоме» = `null`
- [x] `src/lib/ai/prompts/closures.ts` — інструкції з «сьогодні» параметром, межа `<document>`, вирізання тегів із вхідного тексту
- [x] `src/lib/ai/suggest.ts` — `proposeClosures`, `checkTextLength`, `readReply`, мапінг збоїв
- [x] `src/lib/ai/openrouter.ts` і `models.ts` — ключ в одному файлі з `server-only`, ланцюжок `:free`
- [x] `tests/ai-suggest.test.ts`, `tests/ai-key.test.ts` — 16 тестів; три мутації підтвердили, що тести ловлять підміну текстів PM

Done when: AC-ASSIST-05, AC-ASSIST-06, AC-ASSIST-09, AC-ASSIST-10 (на рівні ядра; в інтерфейсі — задача 1)

## 1. Екран помічника: текст, пропозиції, стани

Сторінка `/calendar/assistant` і дія, що просить пропозиції. Нічого не зберігає.

- [x] `src/app/calendar/assistant/page.tsx` — роль із `profiles` через `getClaims()`; не-адміністратор бачить «Only an administrator can change the school calendar» і жодного поля (`AC-ASSIST-11`)
- [x] `src/components/assistant-text-form.tsx` — поле тексту до 2000 символів із підказкою про межу, кнопка; посилання на `/calendar/manage` і назад — на сторінці
- [x] `src/app/calendar/assistant/actions.ts` — `suggestClosures`: роль → `checkTextLength` → `productModel()` → `proposeClosures`; нічого не пише
- [x] перевірка ролі **перед** викликом моделі: чужий запит не витрачає денного ліміту
- [x] `src/components/suggestion-list.tsx` — пропозиції як поля форми, кнопка «Прибрати» на кожній (`AC-ASSIST-03`)
- [ ] клієнтська кнопка з `useFormStatus`: «Preparing suggestions…» і заборона другого прохання (`AC-ASSIST-08`)
- [x] тексти станів дослівно з AC: `needs_info`, `refused`, недоступність, межа довжини
- [x] тести: відмова не-адміністраторові, межа 2000 і рівно 2000, три стани на сторінці
- [x] `tests/e2e/assistant.spec.ts` — працівник за прямим посиланням бачить відмову (без тегу `@writes`)

Done when: AC-ASSIST-01, AC-ASSIST-05, AC-ASSIST-06, AC-ASSIST-08, AC-ASSIST-09, AC-ASSIST-10, AC-ASSIST-11

## 2. Збереження пропозицій

Друга дія: взяти те, що лишилося у формі після виправлень, і зберегти по одній пропозиції.

- [x] `saveSuggestions` у `actions.ts` — роль, повторна валідація zod, по одному `supabase.rpc("add_school_closure", …)` на пропозицію
- [x] **часткове збереження**: пропозиції, що пройшли, зберігаються; для решти збираються дослівні повідомлення вимоги 04 (`AC-ASSIST-04`)
- [x] зведення скороченого дня до однієї дати перед збереженням
- [x] `revalidatePath("/calendar")` після успіху, зведення «збережено N, не збережено M» з повідомленнями
- [x] тести розбору форми: виправлення назви, зведення скороченого дня до однієї дати, прибирання (`AC-ASSIST-03`)
- [ ] тести самого збереження: без змін (`AC-ASSIST-02`) і часткова відмова з текстом «2026-12-28 is already closed: Winter break» (`AC-ASSIST-04`) — лише e2e `@writes`, бо дія ходить у базу
- [ ] `tests/e2e/assistant.spec.ts` — наскрізний шлях під адміністратором, тег `@writes`, прибирання за собою

Done when: AC-ASSIST-02, AC-ASSIST-03, AC-ASSIST-04

## 3. Golden cases офлайн у CI — трек C

Десять кейсів PM як офлайн-реплей; без мережі й без ключа.

- [x] `tests/fixtures/golden/cases.json` — 10 кейсів PM з їхніми ID (`GC-01` … `GC-10`), `expected` лише зі значень таблиці PM, `rubric` словами PM
- [x] `src/lib/ai/scorer.ts` — звірка полів `expected` з відповіддю; вільний текст — лише «must mention / must not» PM
- [x] `tests/ai-scorer.test.ts` — оцінювачеві дають **хибні** відповіді й вимагають, щоб він їх назвав
- [ ] заглушки в `recorded.json` замінити справжніми записами (задача 4): доки вони є, рядки матриці лишаються «відкладено»
- [x] `ASSIST_PROMPT_VERSION` повертається разом із записами (його споживач — перевірка свіжості записів)
- [x] `tests/golden.test.ts` — `it.each`, назва починається з AC ID, без `.skip`
- [x] тест «кожен кейс має запис, зроблений поточною версією промпту»
- [x] тест ін'єкції з `GC-09`: із тексту лишається одне закриття, понеділків немає (`AC-ASSIST-07`)

Done when: AC-ASSIST-07

## 4. Живий eval і звіт — трек C

Запускає людина у своєму терміналі: прогін витрачає денний ліміт.

- [ ] `evals/golden.live.eval.ts` і `vitest.eval.config.mts` з набору курсу; скрипт `eval` у `package.json`
- [ ] `makeJudgeModel` повертається в `models.ts` (його споживач — суддя вільного тексту)
- [ ] `RECORD=1 npm run eval` → справжні записи в `recorded.json` замість заглушок
- [ ] звіт `evals/reports/<дата>.md`: модель на кожен кейс, частка успіху загалом і за моделями, дата, версія промпту
- [ ] кожен FAIL пояснено рядком: модель, промпт чи кейс; що виправлено або чому лишили
- [ ] поріг PM перевірено: ≥ 8 з 10 і `GC-08`, `GC-09`, `GC-10` зелені

Done when: поріг PM виконано або чесно показано, чому ні

## 5. Прод, UAT і завершення зрізу

- [ ] `OPENROUTER_API_KEY` у Vercel (Production і Preview); `/api/health` показує SHA `main`
- [ ] UAT на проді щонайменше на 2 AC: один наскрізний (`AC-ASSIST-02`) і одна відмова чи стан (`AC-ASSIST-11` або `AC-ASSIST-06`)
- [ ] рядки `docs/conformance.md` на всі 11 AC з чесним статусом; `npm run ac:coverage` зелений
- [ ] `npx openspec archive impl-calendar-assistant -y` в останньому PR зрізу

Done when: AC-ASSIST-01 … AC-ASSIST-11 мають чесний статус у матриці
