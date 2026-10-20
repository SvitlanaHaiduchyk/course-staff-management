-- Схема зрізу WS6: ролі продукту, посади з розкладом, заявки на відпустку й записи.
-- План: openspec/changes/impl-leave/design.md. Вимоги: requirements/01-leave-request.md (знімок 2026-10-20).
--
-- Правила для кожної таблиці (AGENTS.md → «База даних»):
--   enable row level security; revoke all from anon, authenticated; явні grant;
--   окрема політика на кожну операцію, завжди to authenticated, auth.uid() лише як (select auth.uid()).

-- ── Ролі продукту: member → employee ────────────────────────────────────────
-- Порядок обов'язковий (див. заголовок 20261012000000_profiles_and_roles.sql):
-- старий constraint не пропустить update на нову роль, а без нового default тригер
-- on_auth_user_created вставить 'member', і наступний npm run users:demo впаде.
alter table public.profiles drop constraint profiles_role_check;
update public.profiles set role = 'employee' where role = 'member';
alter table public.profiles alter column role set default 'employee';
alter table public.profiles add constraint profiles_role_check
  check (role in ('employee', 'manager', 'admin'));

-- ── Відділи ─────────────────────────────────────────────────────────────────
create table public.divisions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.divisions is
  'Частина школи, до якої належить посада (початкова школа, старша школа). Глосарій: requirements/product.md.';

alter table public.divisions enable row level security;
revoke all on table public.divisions from anon, authenticated;
grant select on table public.divisions to authenticated;
grant select, insert, update, delete on table public.divisions to service_role;

-- Довідник, однаковий для всіх: читають усі автентифіковані, змінює лише адміністратор (WS10).
create policy divisions_select_authenticated
  on public.divisions for select to authenticated
  using (true);

-- ── Посади ──────────────────────────────────────────────────────────────────
create table public.positions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  division_id uuid not null references public.divisions (id),
  kind        text not null,
  job_title   text not null,
  created_at  timestamptz not null default now(),
  constraint positions_kind_check check (kind in ('main', 'additional'))
);

comment on table public.positions is
  'Оплачувана посада працівника: тип (основна чи додаткова), відділ, назва. Працівник має рівно одну основну посаду.';

-- requirements/product.md: «An employee has exactly one main position and zero or more additional ones».
create unique index positions_one_main_per_employee
  on public.positions (employee_id) where (kind = 'main');

create index positions_employee_idx on public.positions (employee_id);

alter table public.positions enable row level security;
revoke all on table public.positions from anon, authenticated;
grant select on table public.positions to authenticated;
grant select, insert, update, delete on table public.positions to service_role;

-- ── Відповідальні менеджери посади ──────────────────────────────────────────
-- Окрема таблиця, бо посада може мати кількох менеджерів (AC-DECIDE-07).
create table public.position_managers (
  position_id uuid not null references public.positions (id) on delete cascade,
  manager_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (position_id, manager_id)
);

comment on table public.position_managers is
  'Відповідальні менеджери посади. Посада може мати кількох (AC-DECIDE-07); без жодного записи опрацьовує адміністратор.';

create index position_managers_manager_idx on public.position_managers (manager_id);

alter table public.position_managers enable row level security;
revoke all on table public.position_managers from anon, authenticated;
grant select on table public.position_managers to authenticated;
grant select, insert, update, delete on table public.position_managers to service_role;

-- ── Хелпери доступу ─────────────────────────────────────────────────────────
-- security definer у схемі private, щоб політики не зациклювалися на RLS інших таблиць (42P17).
create or replace function private.manages_position(p_position_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.position_managers as pm
    where pm.position_id = p_position_id
      and pm.manager_id = (select auth.uid())
  );
$$;

create or replace function private.owns_position(p_position_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.positions as p
    where p.id = p_position_id
      and p.employee_id = (select auth.uid())
  );
$$;

revoke execute on function private.manages_position(uuid) from public, anon;
revoke execute on function private.owns_position(uuid) from public, anon;
grant execute on function private.manages_position(uuid) to authenticated;
grant execute on function private.owns_position(uuid) to authenticated;

create policy positions_select_own_managed_or_admin
  on public.positions for select to authenticated
  using (
    employee_id = (select auth.uid())
    or (select private.manages_position(id))
    or (select private.current_app_role()) = 'admin'
  );

create policy position_managers_select_own_or_admin
  on public.position_managers for select to authenticated
  using (
    manager_id = (select auth.uid())
    or (select private.owns_position(position_id))
    or (select private.current_app_role()) = 'admin'
  );

-- ── Блоки розкладу ──────────────────────────────────────────────────────────
-- Розклад зберігаємо блоками, а не парою «початок–кінець дня»: AC-LEAVE-15 вимагає
-- перерви всередині дня, і тривалість рахується лише з хвилин усередині блоків.
create table public.schedule_blocks (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions (id) on delete cascade,
  weekday     smallint not null,
  starts_at   time not null,
  ends_at     time not null,
  created_at  timestamptz not null default now(),
  constraint schedule_blocks_weekday_check check (weekday between 1 and 7),
  constraint schedule_blocks_order_check check (ends_at > starts_at)
);

comment on table public.schedule_blocks is
  'Блок робочого часу посади на день тижня (1 — понеділок). Блок включає starts_at і не включає ends_at.';

create index schedule_blocks_position_idx on public.schedule_blocks (position_id, weekday);

alter table public.schedule_blocks enable row level security;
revoke all on table public.schedule_blocks from anon, authenticated;
grant select on table public.schedule_blocks to authenticated;
grant select, insert, update, delete on table public.schedule_blocks to service_role;

create policy schedule_blocks_select_own_managed_or_admin
  on public.schedule_blocks for select to authenticated
  using (
    (select private.owns_position(position_id))
    or (select private.manages_position(position_id))
    or (select private.current_app_role()) = 'admin'
  );

-- ── Заявки ──────────────────────────────────────────────────────────────────
create table public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles (id) on delete cascade,
  leave_type   text not null,
  relationship text,
  comment      text,
  created_at   timestamptz not null default now(),
  constraint leave_requests_type_check
    check (leave_type in ('sick', 'personal', 'unpaid', 'family_celebration')),
  -- AC-LEAVE-12: «Family celebration» без ступеня спорідненості не приймається.
  constraint leave_requests_relationship_check check (
    (leave_type = 'family_celebration' and relationship is not null)
    or (leave_type <> 'family_celebration' and relationship is null)
  ),
  -- AC-LEAVE-18: коментар не довший за 500 символів.
  constraint leave_requests_comment_length_check check (comment is null or char_length(comment) <= 500)
);

comment on table public.leave_requests is
  'Одне подання працівника: одна чи кілька дат і одна чи кілька посад. Один тип відпустки на заявку (припущення PM).';

create index leave_requests_employee_idx on public.leave_requests (employee_id);

alter table public.leave_requests enable row level security;
revoke all on table public.leave_requests from anon, authenticated;
grant select, insert on table public.leave_requests to authenticated;
grant select, insert, update, delete on table public.leave_requests to service_role;

-- ── Записи ──────────────────────────────────────────────────────────────────
create table public.leave_records (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.leave_requests (id) on delete cascade,
  position_id uuid not null references public.positions (id),
  on_date     date not null,
  starts_at   time not null,
  ends_at     time not null,
  status      text not null default 'awaiting',
  created_at  timestamptz not null default now(),
  constraint leave_records_status_check
    check (status in ('awaiting', 'approved', 'rejected', 'returned', 'cancelled')),
  constraint leave_records_order_check check (ends_at > starts_at)
);

comment on table public.leave_records is
  'Частина заявки для однієї посади на одну дату. Рішення ухвалюються саме по записах (AC-DECIDE-02).';

create index leave_records_request_idx on public.leave_records (request_id);
create index leave_records_position_date_idx on public.leave_records (position_id, on_date);

alter table public.leave_records enable row level security;
revoke all on table public.leave_records from anon, authenticated;
grant select, insert on table public.leave_records to authenticated;
-- Колонковий grant: працівник змінює лише години (AC-DECIDE-16, AC-DECIDE-21),
-- але не статус і не посаду. Статус змінює менеджер — це наступний зріз.
grant update (starts_at, ends_at) on table public.leave_records to authenticated;
grant select, insert, update, delete on table public.leave_records to service_role;

create or replace function private.owns_record(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leave_requests as r
    where r.id = p_request_id
      and r.employee_id = (select auth.uid())
  );
$$;

revoke execute on function private.owns_record(uuid) from public, anon;
grant execute on function private.owns_record(uuid) to authenticated;

create policy leave_requests_select_own_or_admin
  on public.leave_requests for select to authenticated
  using (
    employee_id = (select auth.uid())
    or (select private.current_app_role()) = 'admin'
  );

-- Працівник подає заявки лише від свого імені (requirements/product.md, матриця прав).
create policy leave_requests_insert_own
  on public.leave_requests for insert to authenticated
  with check (employee_id = (select auth.uid()));

-- AC-LEAVE-14: працівник бачить лише власні записи. AC-DECIDE-01: менеджер — лише записи своїх посад.
create policy leave_records_select_own_managed_or_admin
  on public.leave_records for select to authenticated
  using (
    (select private.owns_record(request_id))
    or (select private.manages_position(position_id))
    or (select private.current_app_role()) = 'admin'
  );

create policy leave_records_insert_own
  on public.leave_records for insert to authenticated
  with check (
    (select private.owns_record(request_id))
    and (select private.owns_position(position_id))
  );

-- AC-DECIDE-12: погоджений запис працівник не змінює; AC-DECIDE-16 — лише той, що чекає рішення.
create policy leave_records_update_own_awaiting
  on public.leave_records for update to authenticated
  using (
    (select private.owns_record(request_id))
    and status in ('awaiting', 'returned')
  )
  with check (
    (select private.owns_record(request_id))
    and status in ('awaiting', 'returned')
  );
