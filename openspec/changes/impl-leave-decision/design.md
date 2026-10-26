# Рішення реалізації зрізу leave-decision

Кожне рішення — з AC, який його вимагає. Чого немає у вимогах PM — немає й тут.

## UI і компоненти

### Сторінки

| Шлях | Хто бачить | Що на ній | AC |
|---|---|---|---|
| `/decisions` | `manager`, `admin` | «Awaiting decision» — записи, які **ця людина** може вирішити; під ним «History» — її власні рішення | `AC-DECIDE-01`, `AC-DECIDE-11`, `AC-DECIDE-14`, `AC-DECIDE-15` |
| `/requests` (є) | `employee` і всі | додаємо статус, коментар менеджера, редагування годин, скасування, повторне подання | `AC-DECIDE-03`, `AC-DECIDE-05`, `AC-DECIDE-06`, `AC-DECIDE-12`, `AC-DECIDE-13`, `AC-DECIDE-16`, `AC-DECIDE-17`, `AC-DECIDE-21`, `AC-DECIDE-22`, `AC-DECIDE-23`, `AC-DECIDE-24` |

Посилання на `/decisions` у шапці показуємо лише тим, хто має роль `manager` або `admin`. Це **UX, а не захист**: перевірка ролі живе в серверній дії (розділ «Auth»).

### Компоненти

Лише з `@/components/ui` (DESIGN.md, розділ 5). Нових токенів зріз не потребує: усі п'ять статусів уже є в `globals.css` з WS7-дизайн-системи.

- `Table` — список записів: працівник, посада, дата, години, тип, коментар працівника (`AC-DECIDE-20`).
- `Badge` зі статусним токеном — **статус завжди текстом**, колір лише на додачу (вимога PM, `…spec#14`).
- `Dialog` — підтвердження погодження й відхилення: «Approved» і «Rejected» у цьому зрізі не скасувати (`…spec#17`).
- `Textarea` для коментаря менеджера; `Alert` варіанта `destructive` для відмов.

### Порожні стани й помилки

Тексти — **дослівно з AC**, нічого не перефразовуємо.

| Коли | Що показуємо | AC |
|---|---|---|
| у менеджера 0 записів на розгляді | «No records awaiting decision» | `AC-DECIDE-14` |
| повернення без коментаря | «Tell the employee what to fix», введене лишається у формі | `AC-DECIDE-04` |
| інший менеджер уже вирішив | «Another manager has already decided: Approved» (статус — фактичний) | `AC-DECIDE-07` |
| менеджер відкрив власний запис | «Your own record is decided by an administrator» | `AC-DECIDE-18` |
| працівник змінює години погодженого | «This record is already approved and cannot be changed» | `AC-DECIDE-12` |
| працівник змінює тип відпустки | «Only the hours can be changed. To change the date, position or leave type, cancel this record and submit a new request» | `AC-DECIDE-21` |
| нові години перетинаються з іншим записом | «You already have a request for this time: 2026-11-02 08:30–10:00» | `AC-DECIDE-22` |

## Дані й RLS

### Нова таблиця `leave_decisions`

Історія рішень окремими рядками, а не колонками в `leave_records`: запис може пройти цикл «повернуто → виправлено → погоджено», і кожне рішення має лишитися видимим (`AC-DECIDE-15`). Поточний статус лишається в `leave_records.status`, коментар для працівника — коментар **останнього** рішення.

| Колонка | Тип | Навіщо |
|---|---|---|
| `id` | uuid pk | |
| `record_id` | uuid → `leave_records` | чиє рішення |
| `decided_by` | uuid → `profiles` | хто вирішив — потрібне `AC-DECIDE-10` і `AC-DECIDE-15` |
| `decision` | text, check `approved\|rejected\|returned` | |
| `comment` | text, ≤ 500 | обов'язковий лише для `returned` (`AC-DECIDE-04`) |
| `decided_at` | timestamptz default now() | «date and time of the decision» (`AC-DECIDE-15`) |

`enable row level security`; `revoke all … from anon, authenticated`; `grant select` — усім автентифікованим, `grant insert` — теж (політика обмежить, кому саме). Жодного `grant update` і `grant delete`: **рішення не редагують і не видаляють**.

Політика `select` — ті самі, хто бачить сам запис: власник, відповідальний менеджер посади, адміністратор (`AC-DECIDE-15` — «the employee or any responsible manager of the position»). Політика `insert` — лише той, хто справді має право вирішувати (хелпер нижче), і `decided_by = (select auth.uid())`: свого імені під чужим рішенням не підставити.

### Хто має право вирішувати — хелпер `private.decides_record(uuid)`

У схемі `private`, `security definer`, `set search_path = ''` — як вимагає `AGENTS.md`. Роль читаємо з `profiles.role`, **ніколи** з `user_metadata`.

```
адміністратор                                  → так   (AC-DECIDE-10, AC-DECIDE-19)
відповідальний менеджер посади і НЕ власник    → так   (AC-DECIDE-01)
відповідальний менеджер і власник              → ні    (AC-DECIDE-18)
менеджер чужої посади                          → ні    (AC-DECIDE-08)
працівник без ролі                             → ні    (AC-DECIDE-09)
```

Прикметно, що `AC-DECIDE-18` робить роль недостатньою умовою: право залежить і від того, **чий** це запис. Саме тому перевірка — окремий хелпер, а не `role = 'manager'` у політиці.

### Колонкові `grant` на `leave_records`

Зараз `grant update (starts_at, ends_at) to authenticated`. Додаємо `status` — **і тільки його**:

```sql
grant update (starts_at, ends_at, status) on table public.leave_records to authenticated;
```

`request_id`, `position_id` і `on_date` лишаються без `grant update` назавжди: це й є `AC-DECIDE-21` на рівні бази — дату й посаду не змінити, навіть прямим запитом повз сторінки. Тип відпустки лежить у `leave_requests`, де в `authenticated` узагалі немає `update`.

### Політики `update` на `leave_records`

Дві **окремі** політики (не `for all`), обидві `to authenticated` і з `(select auth.uid())`:

1. `leave_records_update_own_pending` (є, розширюємо) — власник змінює **свій** запис у статусі `awaiting` або `returned`. `with check` дозволяє лишити статус або поставити `cancelled` (`AC-DECIDE-13`, `AC-DECIDE-17`) чи `awaiting` (повторне подання, `AC-DECIDE-06`). Погоджений запис під `using` не підпадає — звідси `AC-DECIDE-12`.
2. `leave_records_update_decision` (нова) — `private.decides_record(id)` і `status = 'awaiting'` в `using`, новий статус із трьох рішень у `with check`.

`using status = 'awaiting'` у другій політиці — це і є `AC-DECIDE-07`: після рішення першого менеджера рядок просто не потрапляє під `update` другого. Повідомлення дає функція, база лише не дає змінити.

### Функції

Дві, обидві `security invoker` (RLS і політики лишаються чинними) і `set search_path = ''`:

- `public.decide_leave_record(p_record_id, p_decision, p_comment)` — перевіряє обов'язковий коментар (`AC-DECIDE-04`), оновлює статус, вставляє рядок історії. Якщо `update` не зачепив жодного рядка — розрізняє причину й кидає потрібний текст: власний запис менеджера (`AC-DECIDE-18`), уже вирішено (`AC-DECIDE-07`), немає права (`AC-DECIDE-08`, `AC-DECIDE-09`). Статус і рядок історії — в одній транзакції: **рішення без сліду в історії неможливе** (те саме міркування, що й ADR 0001).
- `public.update_record_hours(p_record_id, p_starts_at, p_ends_at)` — перевіряє перетин з **іншими** записами тієї самої посади на ту саму дату, виключаючи сам запис (`AC-DECIDE-22`, припущення PM «not checked for overlap against itself»), і оновлює години (`AC-DECIDE-16`).

Міграція одна на зміну, застосовані файли не чіпаємо: розширення політики `leave_records_update_own_pending` — через `drop policy` + `create policy` у **новому** файлі.

## Auth

- **Кожна серверна дія зрізу** починається з `supabase.auth.getClaims()`, ніколи `getSession()`. Роль — із `profiles`, не з токена.
- **Перевірка — у самій дії**, а не лише в `proxy.ts`, layout чи прихованій кнопці: Server Action — публічний POST-ендпойнт, його викликають напряму. `src/proxy.ts` лише оновлює сесію, як і раніше.
- **Друга лінія — база.** Навіть якби перевірку в дії прибрали, політика `leave_records_update_decision` і хелпер `private.decides_record` не дадуть чужому вирішити запис. Саме це перевіряють тести на PGlite: прибираєш політику — тест падає.
- **Admin-клієнт зрізу не потрібен.** Нічого з Admin API тут немає, тож `SUPABASE_SECRET_KEY` у Vercel не додаємо — ні в Production, ні в Preview. Охороняє це правило `check:boundary` у `architecture.yml`.
- Сторінка `/decisions` для працівника без ролі менеджера показує відмову й **жодного чужого запису**: список і так будує політика `select`, тож навіть помилка в умові сторінки чужих даних не відкриє.

## Чого свідомо не робимо в цій зміні

- Не чіпаємо `openspec/specs/` — специфікація зрізу вже злита; це план реалізації.
- Не робимо e2e: цього тижня лише Vitest і тести бази на PGlite (e2e — WS8). AC про стан інтерфейсу покриваємо тестом логіки, яка обирає текст.
- Не чіпаємо `ci.yml` і назви його jobs: нові перевірки — лише в `architecture.yml`.
