-- Зріз leave-balance: перенесені дні, поділ на записі й доступ до чужих залишків.
--
-- План і обґрунтування — openspec/changes/impl-leave-balance/design.md.
--
-- Ключове рішення: частку дня зберігаємо в МОМЕНТ ПОГОДЖЕННЯ, а не
-- перераховуємо з розкладів. AC-BALANCE-14 прямо каже, що залишок береться на
-- момент рішення; розклади змінює адміністратор у WS10, і перерахунок на льоту
-- мовчки змінив би торішні баланси; а поділ (AC-BALANCE-10, -19) — це рішення
-- менеджера, його з даних не вивести.

-- ---------------------------------------------------------------------------
-- Поділ на записі
-- ---------------------------------------------------------------------------
-- days_on_type   — списано з балансу типу САМОГО запису
-- days_unpaid    — зараховано як «Unpaid leave» через поділ
--
-- Обидві null, доки запис не погоджено (AC-BALANCE-04: запис на розгляді
-- балансу не чіпає), і разом дають частку дня. Для запису типу 'unpaid' уся
-- частка йде в days_on_type.
--
-- Колонкового grant update на них authenticated НЕ отримує: їх пише лише
-- функція погодження (міграція наступної задачі).
alter table public.leave_records
  add column days_on_type numeric(4, 2),
  add column days_unpaid  numeric(4, 2);

alter table public.leave_records
  add constraint leave_records_days_nonnegative_check
    check (
      (days_on_type is null and days_unpaid is null)
      or (days_on_type >= 0 and days_unpaid >= 0)
    );

-- Одна дата ніколи не більша за 1.00 дня (припущення PM).
alter table public.leave_records
  add constraint leave_records_days_total_check
    check (days_on_type is null or days_on_type + days_unpaid <= 1.00);

comment on column public.leave_records.days_on_type is
  'Списано з балансу типу самого запису в момент погодження (AC-BALANCE-10).';
comment on column public.leave_records.days_unpaid is
  'Зараховано як Unpaid leave через поділ (AC-BALANCE-10, AC-BALANCE-19).';

-- ---------------------------------------------------------------------------
-- Перенесені дні
-- ---------------------------------------------------------------------------
-- Єдине, що не виводиться з записів (AC-BALANCE-11, AC-BALANCE-21): на старті
-- першого року їх вносить розробник як тестові дані (припущення PM).
--
-- school_year — рік ПОЧАТКУ: 2026 означає 2026–2027.
create table public.leave_carryover (
  employee_id uuid     not null references public.profiles (id) on delete cascade,
  leave_type  text     not null,
  school_year smallint not null,
  days        numeric(5, 2) not null,
  created_at  timestamptz not null default now(),
  primary key (employee_id, leave_type, school_year),
  constraint leave_carryover_type_check
    check (leave_type in ('sick', 'personal', 'unpaid', 'family_celebration')),
  constraint leave_carryover_days_check check (days >= 0),
  constraint leave_carryover_year_check check (school_year between 2000 and 2200)
);

alter table public.leave_carryover enable row level security;

revoke all on table public.leave_carryover from anon, authenticated;
-- Лише читання: перенесення вносить розробник скриптом, не застосунок.
grant select on table public.leave_carryover to authenticated;
grant select, insert, update, delete on table public.leave_carryover to service_role;

-- ---------------------------------------------------------------------------
-- Хто бачить чужі залишки
-- ---------------------------------------------------------------------------
-- AC-BALANCE-20 вимагає, щоб менеджер БУДЬ-ЯКОЇ посади працівника бачив ПОВНИЙ
-- наскрізний баланс — ті самі числа, що бачить сам працівник. Наявні політики
-- цього не дають: вони віддають менеджеру лише ЙОГО посади та їхні записи, тож
-- без розкладу інших посад немає навіть знаменника частки дня (AC-BALANCE-06).
--
-- Та сама вада, що й AC-DECIDE-20 у зрізі 2: критерій мовчки вимагає доступу,
-- якого політика не дає, і з тексту вимоги цього не видно.
--
-- Область — «працівник, у якого я веду хоча б одну посаду». Лише читання.
create or replace function private.manages_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.positions as pos
    join public.position_managers as pm on pm.position_id = pos.id
    where pos.employee_id = p_employee_id
      and pm.manager_id = (select auth.uid())
  );
$$;

revoke execute on function private.manages_employee(uuid) from public, anon;
grant execute on function private.manages_employee(uuid) to authenticated;

-- AC-BALANCE-12, AC-BALANCE-13: залишки чужого працівника не показуються.
create policy leave_carryover_select_own_managed_or_admin
  on public.leave_carryover for select to authenticated
  using (
    employee_id = (select auth.uid())
    or (select private.manages_employee(employee_id))
    or (select private.current_app_role()) = 'admin'
  );

-- ---------------------------------------------------------------------------
-- Залишки: агрегат за перевіркою, а не ширший доступ до рядків
-- ---------------------------------------------------------------------------
-- AC-BALANCE-20 вимагає, щоб менеджер БУДЬ-ЯКОЇ посади бачив ПОВНИЙ баланс —
-- отже, числа по посадах, якими він не керує. Спокуса — розширити політику
-- select на leave_records. Так робити НЕ можна: матриця прав PM каже
-- «See other employees' leave records — only records of own positions», і
-- AC-DECIDE-01 прямо вимагає, щоб у списку «Awaiting decision» чужих записів
-- не було. Ширша політика ламає обидва.
--
-- Тому рядки лишаються вузькими, а назовні віддаємо лише АГРЕГАТ: функція в
-- схемі private, security definer, з перевіркою права ВСЕРЕДИНІ — тож прямий
-- виклик не дає нічого зайвого. Назовні бачить лише суми, не чужі записи.
create or replace function private.may_see_balance(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_employee_id = (select auth.uid())
      or (select private.manages_employee(p_employee_id))
      or (select private.current_app_role()) = 'admin';
$$;

revoke execute on function private.may_see_balance(uuid) from public, anon;
grant execute on function private.may_see_balance(uuid) to authenticated;

-- Усі робочі хвилини працівника на дату — знаменник частки дня (AC-BALANCE-06).
-- Менеджеру вони потрібні й по посадах, якими він не керує (AC-BALANCE-09),
-- але це одне число, а не чужий розклад.
create or replace function private.working_minutes_on(p_employee_id uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select private.may_see_balance(p_employee_id)) then coalesce((
    select sum(extract(epoch from (sb.ends_at - sb.starts_at)) / 60)::integer
    from public.schedule_blocks as sb
    join public.positions as pos on pos.id = sb.position_id
    where pos.employee_id = p_employee_id
      and sb.weekday = case when extract(isodow from p_date) = 0
                            then 7 else extract(isodow from p_date)::int end
  ), 0) else 0 end;
$$;

revoke execute on function private.working_minutes_on(uuid, date) from public, anon;
grant execute on function private.working_minutes_on(uuid, date) to authenticated;

create or replace function public.working_minutes_on(p_employee_id uuid, p_date date)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select private.working_minutes_on(p_employee_id, p_date) $$;

revoke execute on function public.working_minutes_on(uuid, date) from public, anon;
grant execute on function public.working_minutes_on(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Залишки одного працівника за навчальний рік
-- ---------------------------------------------------------------------------
-- security invoker: політики вище лишаються чинними, функція нічого не обходить.
-- Якщо викликач не має права бачити залишки — політики просто не віддадуть
-- рядків, і функція поверне нулі замість чужих чисел.
--
-- Навчальний рік визначає ДАТА ЗАПИСУ, а не дата рішення (AC-BALANCE-21):
-- рік запису — це рік його on_date, за межею 1 вересня.
--
-- «Unpaid leave» використано = власні записи цього типу ПЛЮС неоплачувані
-- частини поділів усіх типів (AC-BALANCE-10).
create or replace function private.employee_balance(
  p_employee_id uuid,
  p_school_year smallint
)
-- numeric(6,2) у returns, щоб числа завжди приходили з двома знаками:
-- coalesce(..., 0) інакше дав би «0» замість «0.00».
returns table (
  leave_type   text,
  carried_over numeric(6, 2),
  used         numeric(6, 2)
)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select (select private.may_see_balance(p_employee_id)) as ok
  ),
  types as (
    select unnest(array['sick', 'personal', 'unpaid', 'family_celebration']) as leave_type
  ),
  approved as (
    select req.leave_type,
           rec.days_on_type,
           rec.days_unpaid
    from public.leave_records as rec
    join public.leave_requests as req on req.id = rec.request_id
    join public.positions as pos on pos.id = rec.position_id
    where pos.employee_id = p_employee_id
      and rec.status = 'approved'
      and rec.days_on_type is not null
      and (case when extract(month from rec.on_date) >= 9
                then extract(year from rec.on_date)
                else extract(year from rec.on_date) - 1
           end) = p_school_year
  )
  select t.leave_type,
         coalesce((
           select c.days from public.leave_carryover as c
           where c.employee_id = p_employee_id
             and c.leave_type = t.leave_type
             and c.school_year = p_school_year
         ), 0)::numeric(6, 2) as carried_over,
         (
           coalesce((select sum(a.days_on_type) from approved as a
                      where a.leave_type = t.leave_type), 0)
           + case when t.leave_type = 'unpaid'
                  then coalesce((select sum(a.days_unpaid) from approved as a), 0)
                  else 0 end
         )::numeric(6, 2) as used
  from types as t
  where (select ok from allowed);
$$;

revoke execute on function private.employee_balance(uuid, smallint) from public, anon;
grant execute on function private.employee_balance(uuid, smallint) to authenticated;

-- Тонка обгортка: supabase.rpc() бачить лише схему public.
create or replace function public.employee_balance(
  p_employee_id uuid,
  p_school_year smallint
)
returns table (
  leave_type   text,
  carried_over numeric(6, 2),
  used         numeric(6, 2)
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.employee_balance(p_employee_id, p_school_year) $$;

comment on function public.employee_balance(uuid, smallint) is
  'Перенесені й використані дні працівника за навчальний рік. Віддає лише агрегат і лише тому, хто має право його бачити (AC-BALANCE-12, AC-BALANCE-13, AC-BALANCE-20).';

revoke execute on function public.employee_balance(uuid, smallint) from public, anon;
grant execute on function public.employee_balance(uuid, smallint) to authenticated;
