-- Зріз school-calendar, задача 2: таблиця закриттів, RLS і додавання однією транзакцією.
--
-- Вимоги: requirements/04-school-calendar.md (знімок 2026-11-18);
-- специфікація: openspec/specs/school-calendar/spec.md;
-- план і обґрунтування: openspec/changes/impl-school-calendar/design.md.
--
-- Головне рішення зрізу: про закриття має знати БАЗА, а не лише сторінка.
-- Частку дня рахує Postgres (private.working_minutes_on), тож знаменник
-- балансу мусить бачити закриті хвилини. Друга реалізація того самого правила
-- живе в TypeScript (src/lib/leave/closure.ts) — кожну перевіряє свій тест.

-- btree_gist потрібен для exclude using gist з рівністю по звичайних типах;
-- тут — щоб діапазон дат порівнювався оператором &&.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Таблиця закриттів
-- ---------------------------------------------------------------------------
-- Два види закриття в одній таблиці, а не дві таблиці: календар читає й
-- упорядковує їх разом (AC-CAL-02), а заборона спільної дати (AC-CAL-11) діє
-- і МІЖ видами теж.
create table public.school_closures (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  starts_on  date not null,
  ends_on    date not null,
  -- null — закриття на цілі дні; час — скорочений день до кінця доби.
  closes_at  time,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),

  constraint school_closures_name_check
    check (length(btrim(name)) between 1 and 100),
  -- AC-CAL-10: кінець не раніший за початок.
  constraint school_closures_order_check check (ends_on >= starts_on),
  -- Скорочений день — завжди одна дата.
  constraint school_closures_single_day_check
    check (closes_at is null or starts_on = ends_on),
  -- Припущення PM: час обирають із кроком 5 хвилин.
  constraint school_closures_step_check
    check (
      closes_at is null
      or (extract(second from closes_at) = 0 and extract(minute from closes_at)::int % 5 = 0)
    ),
  -- AC-CAL-11, AC-CAL-17: дві закриття не можуть ділити дату. Тримає БАЗА, а не
  -- лише перевірка в коді: двоє адміністраторів (чи дві вкладки) могли б
  -- закрити ту саму дату двічі, і перевірка в застосунку цього не побачила б.
  constraint school_closures_no_overlap
    exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);

comment on table public.school_closures is
  'Закриті дні шкільного календаря: цілі дні й скорочені дні (AC-CAL-01).';
comment on column public.school_closures.closes_at is
  'Час, з якого школа закрита до кінця доби; null — закриття на цілий день.';

create index school_closures_dates_idx on public.school_closures (starts_on, ends_on);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.school_closures enable row level security;
revoke all on table public.school_closures from anon, authenticated;

-- Автогрантів немає — видаємо явно й рівно те, що потрібно.
grant select, insert, delete on table public.school_closures to authenticated;
-- Серверні скрипти (npm run closures:demo) працюють із секретним ключем як service_role.
grant select, insert, update, delete on table public.school_closures to service_role;
-- grant update НЕ видаємо нікому з authenticated: PM виніс зміну закриття поза межі зрізу
-- (прибрати й додати нове). Без grant update неможливий, навіть якби хтось
-- згодом додав політику.

-- Календар бачить кожен авторизований (AC-CAL-02); anon не отримує нічого,
-- бо grant йому не видано взагалі (AC-CAL-14).
create policy school_closures_select_authenticated
  on public.school_closures for select to authenticated
  using (true);

-- AC-CAL-12, AC-CAL-13: змінювати календар може лише адміністратор. Роль
-- беремо з profiles через хелпер, ніколи з user_metadata.
create policy school_closures_insert_admin
  on public.school_closures for insert to authenticated
  with check (
    (select private.current_app_role()) = 'admin'
    and created_by = (select auth.uid())
  );

create policy school_closures_delete_admin
  on public.school_closures for delete to authenticated
  using ((select private.current_app_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- Хелпери «що закрито на цю дату»
-- ---------------------------------------------------------------------------
-- security definer + set search_path = '': читають таблицю в обхід RLS, щоб
-- знаменник балансу працював однаково для всіх і не залежав від політик.
create or replace function private.closure_on(p_date date)
returns public.school_closures
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.school_closures as c
  where c.starts_on <= p_date and p_date <= c.ends_on
  limit 1;
$$;

revoke execute on function private.closure_on(date) from public, anon;
grant execute on function private.closure_on(date) to authenticated;

-- Час, з якого дата закрита: 00:00 для цілого дня, closes_at для скороченого,
-- null — закриття немає. Одне значення замість двох гілок у кожному виклику
-- (дзеркало closedFrom у src/lib/leave/closure.ts).
create or replace function private.closed_from(p_date date)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.closes_at, time '00:00')
  from public.school_closures as c
  where c.starts_on <= p_date and p_date <= c.ends_on
  limit 1;
$$;

revoke execute on function private.closed_from(date) from public, anon;
grant execute on function private.closed_from(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Додавання закриття — перевірка й запис однією транзакцією
-- ---------------------------------------------------------------------------
-- У supabase-js кожен запит — окрема транзакція, тож перевірити й вставити
-- окремими запитами не можна: між ними стан змінюється.
--
-- ЧОМУ ПЕРЕВІРКИ ТУТ, А НЕ В ОБМЕЖЕННЯХ. Обмеження вище ловлять ті самі
-- випадки, але не можуть ПОЯСНИТИ їх словами PM:
--
--   • exclude using gist падає на ПЕРШОМУ ж перетині й повертає помилку
--     Postgres, а AC-CAL-17 вимагає по частині повідомлення на КОЖНЕ наявне
--     закриття, з його першою спільною датою, у порядку дат;
--   • school_closures_name_check дасть «violates check constraint …», не
--     «Enter a name for the closure» і не «The name can be at most 100
--     characters», та ще й ховає два різні AC (AC-CAL-18, AC-CAL-19) за одним
--     обмеженням — розрізнити їх з помилки неможливо.
--
-- Тож функція перевіряє сама й ДО вставки, у фіксованому порядку, а обмеження
-- лишаються другим рубежем проти одночасних адміністраторів.
--
-- security invoker: політики лишаються чинними, і роль адміністратора
-- перевіряє політика insert, а не функція (AC-CAL-13 тримається на політиці).
--
-- Наслідок, який варто знати: не-адміністратор дійде до вставки й упреться в
-- політику, а не в наше повідомлення. Для AC-CAL-13 цього досить — він вимагає
-- лише, щоб календар лишився незмінним. Переносити перевірку ролі у функцію не
-- можна: тоді правом керували б ДВА місця, і прибрана політика лишилася б
-- непоміченою. Тест якраз і прибирає політику, щоб переконатися, що він падає.
--
-- Перевірки 4 і 5 читають таблиці під політиками викликача. Для адміністратора
-- це повний доступ (leave_records_select_own_managed_or_admin,
-- positions_select_own_managed_or_admin, profiles_select_own_or_admin), тож
-- жоден блокувальний запис від нього не сховається.
create or replace function public.add_school_closure(
  p_name      text,
  p_starts_on date,
  p_ends_on   date,
  p_closes_at time default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name    text := btrim(coalesce(p_name, ''));
  v_id      uuid;
  v_clashes text;
  v_records text;
begin
  -- 1. Назва (AC-CAL-18, AC-CAL-19).
  if v_name = '' then
    raise exception 'Enter a name for the closure' using errcode = 'P0001';
  end if;

  if length(v_name) > 100 then
    raise exception 'The name can be at most 100 characters' using errcode = 'P0001';
  end if;

  -- 2. Дати й час (припущення PM; власних AC не мають).
  if p_starts_on is null or p_ends_on is null then
    raise exception 'Enter the start and end dates' using errcode = 'P0001';
  end if;

  -- 3. AC-CAL-10: кінець не раніший за початок.
  if p_ends_on < p_starts_on then
    raise exception 'The end date cannot be earlier than the start date' using errcode = 'P0001';
  end if;

  -- 4. AC-CAL-11 (одне закриття) і AC-CAL-17 (кілька). Для кожного наявного
  -- закриття беремо ПЕРШУ спільну дату, впорядковуємо за нею і з'єднуємо
  -- через «, » — рівно так, як у прикладі PM.
  select string_agg(
           to_char(x.first_shared, 'YYYY-MM-DD') || ' is already closed: ' || x.name,
           ', ' order by x.first_shared
         )
    into v_clashes
  from (
    select c.name, greatest(c.starts_on, p_starts_on) as first_shared
    from public.school_closures as c
    where daterange(c.starts_on, c.ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]')
  ) as x;

  if v_clashes is not null then
    raise exception '%', v_clashes using errcode = 'P0001';
  end if;

  -- 5. AC-CAL-07: день із блокувальними записами закрити не можна. Блокують
  -- «awaiting», «returned» і «approved»; «rejected» і «cancelled» — ні
  -- (AC-CAL-08). Для скороченого дня блокують ЛИШЕ записи з хвилинами після
  -- часу закриття: запис, що закінчується раніше, закриттю не заважає
  -- (припущення PM — на цьому ж тримається AC-CAL-20).
  --
  -- Пари «дата пошта» — у порядку дат, а всередині однієї дати за абеткою
  -- пошти (рішення PM у …spec#26).
  select string_agg(
           to_char(r.on_date, 'YYYY-MM-DD') || ' ' || pr.email,
           ', ' order by r.on_date, pr.email
         )
    into v_records
  from public.leave_records as r
  join public.positions as pos on pos.id = r.position_id
  join public.profiles as pr on pr.id = pos.employee_id
  where r.on_date between p_starts_on and p_ends_on
    and r.status in ('awaiting', 'returned', 'approved')
    and (p_closes_at is null or r.ends_at > p_closes_at);

  if v_records is not null then
    raise exception 'These days have leave records and cannot be closed: %', v_records
      using errcode = 'P0001';
  end if;

  insert into public.school_closures (name, starts_on, ends_on, closes_at, created_by)
  values (v_name, p_starts_on, p_ends_on, p_closes_at, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_school_closure(text, date, date, time) from public, anon;
grant execute on function public.add_school_closure(text, date, date, time) to authenticated;
