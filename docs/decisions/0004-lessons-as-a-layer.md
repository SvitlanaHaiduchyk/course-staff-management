# 0004. Уроки — окремий шар поверх робочих годин, а не їх подрібнення

- Статус: прийнято
- Дата: 2026-11-27
- AC: AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-15, AC-BALANCE-03, AC-CAL-04 (жодного не змінює — рішення про те, щоб їх не зачепити)

## Контекст

Сторінка «Мій розклад» і віконечко дня у шкільному календарі показують блоки
`schedule_blocks`: «08:30–15:30, Teacher». Людина, яка цим користується, хоче
бачити не це, а що саме вона цього дня робить: «08:30–09:30 — Maths, 4-A»,
«10:00–11:00 — Algebra, 8A».

Вимог PM на уроки немає взагалі. У знімку `requirements/` (2026-11-18) є лише
блоки робочого часу посади; слів «lesson», «subject», «form» у вимогах немає.
Питання до PM підготовлено (`docs/spec-reading.md`), але відповіді ще немає.

Обмеження, яке й визначило рішення: **на хвилинах `schedule_blocks` тримається
знаменник балансу**. `private.working_minutes_on` рахує робочі хвилини дати, і
з них виходять «цілий день» посади (`AC-LEAVE-01`, `AC-LEAVE-02`), частки дня
(`AC-BALANCE-03`) і хвилини всередині блоків (`AC-LEAVE-15`: 11:00–13:00 при
блоках 08:30–12:00 і 12:30–15:30 — це 90 хвилин). Те саме правило продубльовано
в `src/lib/leave/schedule.ts`.

## Рішення

Уроки — **нова таблиця `public.lessons`**, шар ПОВЕРХ робочих годин:

- `lessons(position_id, weekday, starts_at, ends_at, subject, form)`;
  `form` може бути `null` — заняття без класу (нарада, чергування).
- `schedule_blocks` не змінено жодним рядком; жодна функція балансу про
  `lessons` не знає, і жоден AC від цієї таблиці не залежить.
- RLS: видно власникові посади, відповідальному менеджерові й адміністраторові
  (точно як `schedule_blocks`); **веде уроки сам працівник** — insert, update і
  delete лише для власної посади. `grant update` — по колонках вмісту, тож
  урок не можна перевести на чужу посаду.
- Показ: уроки малюються всередині робочих годин у тижневій сітці `/schedule` і
  переліком у віконечку дня `/calendar`. Де уроків на день немає, лишається те,
  що було, — блок робочих годин.

## Розглянуті варіанти

**Подрібнити `schedule_blocks` на уроки** (08:30–15:30 → шість блоків по 45 хв).
Відхилено: перерви між уроками перестали б бути робочим часом, і «цілий день»
посади з 7 годин став би 4,5. Це мовчки змінило б уже прийняті `AC-LEAVE-01`,
`AC-LEAVE-02`, `AC-BALANCE-03` — заміна поведінки, на яку немає AC від PM.
Межі з AC беремо дослівно; те саме стосується знаменника.

**Текстовий підпис у `schedule_blocks`** (один стовпець `title`). Відхилено:
один блок 08:30–15:30 — це один підпис, а питання людини саме в тому, що
всередині дня занять кілька й вони різні.

**Нічого не робити до відповіді PM.** Відхилено як вибір за людину: показ
нікому не шкодить, бо не бере участі в жодному обчисленні, а питання PM
поставлено паралельно. Якщо PM відповість інакше — зміниться ця таблиця, а не
правила балансу.

## Наслідки

- Два поняття часу в інтерфейсі: «робочі години» (оплачувані, створює
  адміністратор, рахує баланс) і «заняття» (веде працівник, показ). У текстах
  їх треба розрізняти словами, інакше людина вирішить, що урок впливає на
  відпустку.
- Заборони на перетин уроків у базі немає: PM правила не давав, а обмеження в
  базі — це правило. Смуги, що перетинаються, розкладаються по доріжках.
- Закриття школи урок не обрізає: `openBlocks` (`AC-CAL-04`) діє на робочі
  години, а урок у закритий день просто не показуємо разом із ними.

## Питання до PM (підготовлено, ще не надіслано)

Текст для вебформи «Питання до вимог» у репо PM
(`…/issues/new?template=question.yml`). Надсилає людина; `gh issue create` для
цього не використовуємо. Коли питання буде поставлено, запис про нього йде в
`docs/spec-reading.md` окремим PR «Специфікація» — цей PR «Реалізація» журналу
не торкається.

> **Адреса вимоги:** `docs/requirements/01-leave-request.md` (знімок у нас —
> `requirements/01-leave-request.md`), AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-15;
> `docs/product.md`, глосарій («Schedule block»).
>
> **Питання.** The portal stores a position's schedule as blocks of working
> hours ("08:30–15:30"), and the balance denominator is counted from those
> minutes. An employee looking at their own schedule expects to see what they
> actually do inside those hours — "08:30–09:30 Maths, form 4-A",
> "10:00–11:00 Algebra, form 8A".
>
> 1. Should the portal hold the lessons (or other activities) that happen
>    inside a schedule block, or do the working-hours blocks stay the only
>    schedule the portal knows?
> 2. If lessons are in scope: who enters them — the employee for their own
>    position, or the administrator, as with the school calendar?
> 3. Do lessons ever change the working hours, or is a lesson only shown
>    inside hours that the administrator has already set? We assume the
>    second: if lessons replaced the blocks, the breaks between lessons would
>    stop being working time and the "whole day" of a position would change,
>    which would alter AC-LEAVE-01, AC-LEAVE-02 and AC-BALANCE-03 without a
>    new acceptance criterion.
> 4. What does a leave request mean for a lesson that falls inside it — is
>    anything expected to be shown or changed, or is the leave record still
>    the only thing that matters?
>
> **Чому питаємо.** We are not inventing a rule: until this is answered the
> lessons are a display-only layer that no calculation reads. The answer
> decides whether it becomes a requirement with its own AC.

Доки відповіді немає, заняття лишаються шаром показу: жодне обчислення їх не
читає, жоден AC на них не спирається, і прибрати їх можна однією міграцією.
