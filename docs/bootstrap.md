# Чекліст розробника, день 0

<!--
Заповнюєте ви одразу після заняття, у цьому порядку: власне репо, власні Supabase і Vercel, перший зелений CI, ruleset.
Мета — застосунок працює локально й на вашому прод-URL, міграції в базу застосовує лише CI, а в main усе йде через PR.
Для кожного пункту — доказ: посилання (run CI, PR, preview), назва змінної або знімок екрана в docs/img/
(без справжніх назв клієнта й людей: зображення spec:check не перевіряє).
ЗНАЧЕННЯ СЕКРЕТІВ І ПАРОЛІВ НІКОЛИ НЕ ПИШІТЬ — лише назви змінних і де вони задані.
Заповнений файл (розділи 1–6) — ваш перший PR, тип «Реалізація» (розділ 7): він же перевіряє ruleset. Посилання на сам
цей PR і на preview допишіть наступним PR. Пояснення кроків — README, «Шлях розробника».
Docker не потрібен: локально — лише npm run dev проти вашої бази; міграції на одноразовій базі перевіряє CI (db-check).
-->

Моє репо: <https://github.com/SvitlanaHaiduchyk/course-staff-management> · Прод-URL: <https://course-staff-management.vercel.app>
Репо вимог PM: <https://github.com/mkozlovskyi-ops/course-staff-management-spec> · Організація Supabase: `course-staff-management`

## 1. Інструменти й репо

- [x] Node 24 (`node -v` → `v24.20.0`), Git `2.55.0`, GitHub CLI (`gh auth status` → `SvitlanaHaiduchyk`); OpenSpec CLI
      глобально тієї ж версії, що в `package.json`: `npm i -g @fission-ai/openspec@1.14.1` → `openspec --version` = `1.14.1`
- [x] Репо створено з шаблону (**Use this template → Create a new repository**): власник — особистий акаунт, назва —
      `course-staff-management`, **Public** — <https://github.com/SvitlanaHaiduchyk/course-staff-management>
- [x] `gh repo clone` → `npm ci` → `Copy-Item .env.example .env.local`
- [x] CodeRabbit (GitHub App) встановлено на це репо — `docs/img/coderabbit.png`.
      Перше рев'ю отримано в PR «Оновлення вимог» (Merge Risk 🔵 Low, одне зауваження з відповіддю)
- [ ] Список справжніх назв клієнта PM ще не надсилав, тому `product/denylist.local.txt` не створювався.
      `npm run spec:check` показує «слів у denylist: 0» — це очікувано, поки списку немає

## 2. Supabase: власна база

- [x] Організацію й проєкт створено у власному акаунті (один із двох безкоштовних слотів; проєкт WS5 на паузі,
      тож слот вільний) — регіон `eu-west-1`
- [x] Authentication: «Allow new users to sign up» **вимкнено**, «Confirm email» **вимкнено** —
      `docs/img/auth-signups.png`, `docs/img/auth-email.png`.
      Чому обидва: публічний ключ лежить у JS-бандлі, тож із увімкненою реєстрацією будь-хто завів би собі акаунт;
      вбудована пошта Supabase шле 2 листи/год і лише членам проєкту, тому користувачів створює скрипт
- [x] Authentication → URL Configuration: Site URL = прод-URL Vercel; Redirect URLs `http://localhost:3000/**`,
      `https://*-test11-af77.vercel.app/**` — `docs/img/auth-urls.png`
- [x] `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
      `DEMO_USER_PASSWORD`. Файл у `.gitignore`; значення не комітяться й не вставляються в чат з агентом
      (`.claude/settings.json` забороняє читати `.env*`)

## 3. GitHub: environment `production` і секрети

- [x] Settings → Environments → `production`: **Deployment branches** = Selected branches → `main` —
      `docs/img/github-environment.png`.
      Середовище створив автоматично перший прогін CI; обмеження гілок додано через `gh api`
- [x] Секрет environment `SUPABASE_DB_URL` = рядок **Session pooler** (порт **5432**, хост `*.pooler.supabase.com`,
      користувач `postgres.<ref>`) з Supabase → **Connect**. Пароль бази без спецсимволів, тож percent-encode не потрібен.
      Перевірено: `gh secret list --env production` показує секрет, Repository secrets — порожні
- [x] Запасний шлях не потрібен: `--db-url` працює (див. розділ 5)
- [ ] Секрет репо `SPEC_DENYLIST` — не створювався: списку назв від PM ще немає

## 4. Vercel

- [x] Add New → Project → імпорт репо, Framework `Next.js`, Node 24.x з `engines` —
      <https://course-staff-management.vercel.app>.
      Marketplace-інтеграцію Supabase **не** підключали: вона створила б окрему організацію й зайняла другий слот
- [x] Змінні Production і Preview — лише `NEXT_PUBLIC_SUPABASE_URL` і `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
      `SUPABASE_SECRET_KEY` у Vercel немає — `docs/img/vercel-env.png` (у кадрі лише назви, значення приховані)
- [x] Settings → Deployment Protection → **Require Log In** вимкнено → проєкт у статусі **Unprotected** —
      `docs/img/vercel-protection.png`.
      Це безпечно лише за трьох умов, і всі три виконані: секретного ключа у Vercel немає (preview не обійде RLS),
      RLS і явні GRANT на кожній таблиці, дані лише синтетичні (`*@example.test`)
- [x] Прод-URL відкривається без входу у Vercel: анонімний запит на `/login` повертає `200` і сторінку застосунку
      («Вхід», «Пароль», «Увійти»), а не заглушку Vercel

## 5. База й перший зелений CI

- [x] Actions → CI → **Run workflow** (гілка `main`, `include_seed` ✓) → job `db-deploy` застосував першу міграцію й сид —
      [run 39309530080](https://github.com/SvitlanaHaiduchyk/course-staff-management/actions/runs/39309530080).
      У лозі: `Connecting to remote database…` → `Applying migration 20261012000000_profiles_and_roles.sql…` →
      `Seeding data from supabase/seed.sql…` → `Finished supabase db push.`
      `include_seed` більше не вмикаємо: сид у хмарі виконується один раз
- [x] `npm run users:demo` створив синтетичних користувачів із `supabase/demo-users.json` → `npm run dev` →
      `http://localhost:3000` → вхід як `admin@example.test` працює локально й на прод-URL
- [x] CI на `main` зелений: `spec`, `app`, `conformance`, `db-check`, `db-deploy` — усі п'ять у тому ж прогоні
      [39309530080](https://github.com/SvitlanaHaiduchyk/course-staff-management/actions/runs/39309530080)

## 6. Ruleset `solo-main` (лише після зеленого CI на `main`)

- [x] Створено з `materials/rulesets/solo-main.json` курсового репо через `gh api … /rulesets` —
      `docs/img/ruleset.png`. Перевірено `gh api`:
      enforcement `active`; target `~DEFAULT_BRANCH`; bypass actors — **0**, тобто обійти не може й власник;
      правила `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`;
      перевірки `spec`, `app`, `conformance`, `db-check` (джерело GitHub Actions, без «up to date»);
      методи злиття **Squash** і **Merge**, без Rebase; required approvals — **0** (свій PR GitHub схвалити не дає)

## 7. Перший PR (перевірка ruleset-у)

- [ ] `git switch -c setup/bootstrap` → цей файл із доказами розділів 1–6 → push → PR «Реалізація»
      → окремим коментарем `@coderabbitai review` — <!-- посилання допишемо наступним PR -->
- [ ] Поки перевірки не зелені, кнопка merge заблокована; push у `main` напряму відхиляється
- [ ] Vercel створив preview для PR — <!-- посилання наступним PR -->
- [ ] **Squash and merge** → прод-деплой Vercel пройшов
- [ ] (З першою задачею, що має міграцію) `db-check` зелений, після merge `db-deploy` застосував її у вашу базу

## 8. Вимоги PM і специфікація

- [x] Адресу репо вимог PM узято з оголошення викладача: `mkozlovskyi-ops/course-staff-management-spec`.
      Issues «Вимога» в репо PM немає, вимоги лежать файлами в `docs/` — джерело знімка `docs`
- [x] `/requirements-sync mkozlovskyi-ops/course-staff-management-spec` → PR «Оновлення вимог»
      [#1](https://github.com/SvitlanaHaiduchyk/course-staff-management/pull/1); шапка `docs/conformance.md` показує
      адресу, джерело `docs` і дату знімка `2026-10-19` (коміт PM `031e169`). Знімок містить `product.md` і три вимоги,
      51 AC: `AC-LEAVE-01…16`, `AC-DECIDE-01…19`, `AC-BALANCE-01…16`
- [x] Читання вимог: спершу вручну, потім прохід за таксономією (11 категорій) → журнал `docs/spec-reading.md`.
      П'ять питань у репо PM, усі з відповіддю «Decision: A»:
      коментарі в [#4](https://github.com/mkozlovskyi-ops/course-staff-management-spec/issues/4#issuecomment-6285545648)
      і [#2](https://github.com/mkozlovskyi-ops/course-staff-management-spec/issues/2#issuecomment-6285547451),
      власні issues [#5](https://github.com/mkozlovskyi-ops/course-staff-management-spec/issues/5),
      [#6](https://github.com/mkozlovskyi-ops/course-staff-management-spec/issues/6),
      [#7](https://github.com/mkozlovskyi-ops/course-staff-management-spec/issues/7).
      #7 PM прийняв як помилку у формулюванні вимоги; знахідку дало рев'ю CodeRabbit у PR #1 і перевірено вручну
      на всіх чотирьох критеріях балансу
- [ ] Переклад у специфікацію (гілка `spec/add-<зріз>`) — наступний крок
