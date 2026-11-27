# Рішення реалізації: скасування погодженого запису

## 1. Запит на скасування — окрема таблиця, статус запису не чіпаємо

`public.leave_cancellations`: `record_id`, `requested_by`, `reason`, `requested_at`, і по рішенню — `decision` (`confirmed` / `declined`), `decided_by`, `comment`, `decided_at`.

Чому окрема таблиця, а не колонка в `leave_records`:

- припущення PM каже, що запис із позначкою «Cancellation requested» **і далі рахується як «Approved»** — у залишку, для перетинів, для зайнятості заміни й для закриття дня (`AC-CAL-07`). Отже статус запису змінювати не можна, інакше зламається вже реалізована поведінка WS6 і WS7;
- PM вимагає історію: запит, рішення і хто їх зробив, з точністю до хвилини. Окремі рядки — та сама ідея, що й `leave_decisions` (ADR 0001).

Позначку «Cancellation requested» дає наявність рядка без `decision`. Один відкритий запит на запис — частковий унікальний індекс `where decision is null` (`AC-CANCEL-06`); повідомлення дає функція, індекс — друга лінія.

## 2. Три функції Postgres, усі `security invoker`

У supabase-js немає транзакцій, а кожна дія тут — це перевірка плюс один-два записи. Тому дія = одна функція (AGENTS.md, «База даних»).

| Функція | AC | Що перевіряє до запису |
|---|---|---|
| `public.request_record_cancellation(p_record_id, p_reason)` | `AC-CANCEL-01`, `AC-CANCEL-05`, `AC-CANCEL-06`, `AC-CANCEL-10` | власний запис (`private.owns_record`), статус `approved`, `on_date >= (now() at time zone 'Europe/Kyiv')::date`, немає відкритого запиту |
| `public.decide_record_cancellation(p_record_id, p_decision, p_comment)` | `AC-CANCEL-02`, `AC-CANCEL-03`, `AC-CANCEL-04`, `AC-CANCEL-07`, `AC-CANCEL-11` | право вирішувати (`private.decides_record` — той самий хелпер, що й для рішень, тож `AC-DECIDE-18` діє й тут), відкритий запит існує, для `declined` — непорожній коментар |
| `public.cancel_record_with_note(p_record_id, p_note)` | `AC-CANCEL-08`, `AC-CANCEL-09` | право вирішувати, статус `approved`, непорожня примітка |

Тексти помилок — дослівно зі специфікації: «Records in the past cannot be cancelled», «Cancellation has already been requested», «You can cancel only your own records», «Tell the employee why the cancellation is declined», «Tell the employee why the record is cancelled».

`security invoker` скрізь: RLS лишається чинною, функція нічого не обходить.

## 3. Дні повертаються самі

`private.employee_balance` рахує лише записи зі статусом `approved` і бере з них `days_on_type` і `days_unpaid`. Отже перехід у `cancelled` повертає і частку типу, і частку Unpaid leave розділеного запису — `AC-CANCEL-02` і `AC-CANCEL-07` не потребують жодної окремої арифметики. Те саме з `AC-CANCEL-13`: перевірка закриття дня в `school-calendar` дивиться лише на `awaiting`, `returned` і `approved`, тож скасований запис дату більше не тримає.

Тест має це **довести**, а не припустити: `tests/db/cancel.test.ts` читає `employee_balance` до й після скасування.

## 4. Права

- `leave_cancellations`: `enable row level security`, `revoke all … from anon, authenticated`, далі явні `grant`.
  - `select` — власник запису, відповідальний менеджер посади, адміністратор (як `leave_decisions_select_visible_records`);
  - `insert` — лише власник (`requested_by = (select auth.uid())`);
  - `update (decision, decided_by, comment, decided_at)` — лише той, хто має право вирішувати цей запис.
- `leave_records`: нова політика `leave_records_update_cancellation` — `using (status = 'approved' and private.decides_record(id))`, `with check (status = 'cancelled' and …)`. Наявну `leave_records_update_decision` (лише `awaiting`) не чіпаємо: політики додаються, а не замінюються.
- Тригер сліду `private.require_decision_trail` вимагає рядок історії лише для `approved`, `rejected`, `returned`, тож скасування його не стосується; слід скасування живе в `leave_cancellations`.

## 5. Екрани

- **«Мої заявки»** — на погодженому записі з датою сьогодні або пізніше кнопка «Скасувати» з обов'язковою причиною; на записі з відкритим запитом — позначка «Cancellation requested», а кнопки більше немає (`AC-CANCEL-01`, `AC-CANCEL-06`). Результат рішення менеджера видно тут же: «Cancellation declined: …» (`AC-CANCEL-03`) або примітка менеджера (`AC-CANCEL-08`).
- **«На розгляді» менеджера** — запис із відкритим запитом показується з рядком «Cancellation requested: <причина>» і двома діями: підтвердити й відхилити з коментарем. Поруч — скасування менеджером із приміткою (`AC-CANCEL-08`).
- Доступ до сторінок — наявний `src/proxy.ts`: неавторизований бачить сторінку входу (`AC-CANCEL-12`).
- Вигляд: статус і позначка — **текстом** (DESIGN.md), помилки — `Alert` варіанта `destructive`, бо вони дію зупиняють.

## 6. Чого в цьому зрізі немає

Скасування записів у минулому, скасування частини запису, відкликання запиту працівником, листи — усе в `## Non-goals` зміни специфікації.
