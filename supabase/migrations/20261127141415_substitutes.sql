-- Зріз substitutes (WS8): список замін працівника, заміна в записі й перевірка
-- зайнятості заміни.
--
-- Специфікація — openspec/specs/substitutes/spec.md, план — openspec/changes/impl-substitutes/design.md.
--
-- Рішення: список належить ПРАЦІВНИКОВІ, а не посаді (припущення PM), тож
-- таблиця — пара «працівник → можлива заміна». Хто може її поповнювати, вирішує
-- private.manages_employee (будь-який відповідальний менеджер будь-якої посади
-- цього працівника) або роль адміністратора — AC-SUBST-12, AC-SUBST-13.

-- ---------------------------------------------------------------------------
-- Список можливих замін
-- ---------------------------------------------------------------------------
create table public.substitutes (
  employee_id   uuid not null references public.profiles (id) on delete cascade,
  substitute_id uuid not null references public.profiles (id) on delete cascade,
  added_by      uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  primary key (employee_id, substitute_id),
  -- Працівник не може бути у власному списку (припущення PM).
  constraint substitutes_not_self_check check (employee_id <> substitute_id)
);

create index substitutes_substitute_id_idx on public.substitutes (substitute_id);

alter table public.substitutes enable row level security;

revoke all on table public.substitutes from anon, authenticated;
grant select, insert, delete on table public.substitutes to authenticated;
grant select, insert, update, delete on table public.substitutes to service_role;

-- AC-SUBST-04: працівник бачить СВІЙ список (з нього обирає заміну); менеджер —
-- списки своїх працівників; адміністратор — усі.
create policy substitutes_select_own_managed_or_admin
  on public.substitutes for select to authenticated
  using (
    employee_id = (select auth.uid())
    or substitute_id = (select auth.uid())
    or (select private.manages_employee(employee_id))
    or (select private.current_app_role()) = 'admin'
  );

-- AC-SUBST-01, AC-SUBST-12, AC-SUBST-13: поповнює список лише відповідальний
-- менеджер посади цього працівника або адміністратор. Працівник — ніколи,
-- навіть для власного списку й навіть прямим запитом.
create policy substitutes_insert_manager_or_admin
  on public.substitutes for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and (
      (select private.manages_employee(employee_id))
      or (select private.current_app_role()) = 'admin'
    )
  );

create policy substitutes_delete_manager_or_admin
  on public.substitutes for delete to authenticated
  using (
    (select private.manages_employee(employee_id))
    or (select private.current_app_role()) = 'admin'
  );

-- ---------------------------------------------------------------------------
-- Заміна в записі
-- ---------------------------------------------------------------------------
-- Колонка, а не окрема таблиця: заміна одна на запис (припущення PM, «one
-- substitute covers the whole record»), і її видно скрізь, де видно запис.
alter table public.leave_records
  add column substitute_id uuid references public.profiles (id);

-- AC-SUBST-10: заміна бачить записи, де підміняє когось. Окрема політика —
-- наявні (власник, менеджер посади, адміністратор) лишаються як були.
create policy leave_records_select_substitute
  on public.leave_records for select to authenticated
  using (substitute_id = (select auth.uid()));

-- AC-SUBST-02: заміну видно менеджерові разом із заявкою; сама заявка вже
-- віддається політиками зрізу 2.
create policy leave_requests_select_substitute
  on public.leave_requests for select to authenticated
  using (
    exists (
      select 1 from public.leave_records as rec
      where rec.request_id = public.leave_requests.id
        and rec.substitute_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Кого видно на ім'я
-- ---------------------------------------------------------------------------
-- Працівник обирає заміну зі свого списку (AC-SUBST-04), а заміна бачить, кого
-- підміняє (AC-SUBST-10). Для обох потрібні адреси людей, яких політики на
-- profiles досі не віддавали. Відкриваємо рівно ці два випадки — не більше.
create policy profiles_select_my_substitutes
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.substitutes as s
      where s.substitute_id = public.profiles.id
        and s.employee_id = (select auth.uid())
    )
  );

create policy profiles_select_people_i_cover
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.leave_records as rec
      join public.positions as pos on pos.id = rec.position_id
      where rec.substitute_id = (select auth.uid())
        and pos.employee_id = public.profiles.id
    )
  );

-- Адреса людини для повідомлення про зайнятість (AC-SUBST-05, AC-SUBST-06):
-- текст PM називає саме адресу, а політики profiles її тому, хто подає заявку,
-- можуть і не віддати. Функція віддає ОДНЕ поле й нічого більше.
create or replace function private.profile_email(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select p.email from public.profiles as p where p.id = p_id $$;

revoke execute on function private.profile_email(uuid) from public, anon;
grant execute on function private.profile_email(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Чи вільна заміна в цей час
-- ---------------------------------------------------------------------------
-- Зайнята (AC-SUBST-05, AC-SUBST-06) — коли в будь-яку хвилину запису вона має
-- власний запис АБО є заміною в іншому записі зі статусом «awaiting»,
-- «returned» чи «approved». «rejected» і «cancelled» зайнятості не створюють
-- (AC-SUBST-07). Дотик межами перетином не є — строгі нерівності, як і в
-- перевірці перетину власних записів.
--
-- security definer: заміна може мати записи, яких той, хто подає заявку, не
-- бачить. Функція віддає лише час першого перетину — не тип відпустки, не
-- посаду й не коментар.
create or replace function private.substitute_busy_at(
  p_substitute_id uuid,
  p_on_date       date,
  p_starts_at     time,
  p_ends_at       time
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clash public.leave_records%rowtype;
begin
  select rec.* into v_clash
  from public.leave_records as rec
  join public.leave_requests as req on req.id = rec.request_id
  join public.positions as pos on pos.id = rec.position_id
  where rec.on_date = p_on_date
    and rec.status in ('awaiting', 'returned', 'approved')
    and rec.starts_at < p_ends_at
    and p_starts_at < rec.ends_at
    and (pos.employee_id = p_substitute_id or rec.substitute_id = p_substitute_id)
  -- «Якщо зайнятість дають кілька записів, повідомлення називає перший за часом».
  order by rec.starts_at
  limit 1;

  if not found then
    return null;
  end if;

  return to_char(v_clash.on_date, 'YYYY-MM-DD') || ' ' ||
         to_char(v_clash.starts_at, 'HH24:MI') || '–' ||
         to_char(v_clash.ends_at, 'HH24:MI');
end;
$$;

revoke execute on function private.substitute_busy_at(uuid, date, time, time) from public, anon;
grant execute on function private.substitute_busy_at(uuid, date, time, time) to authenticated;

-- ---------------------------------------------------------------------------
-- Подання заявки із заміною
-- ---------------------------------------------------------------------------
-- Та сама функція, що й у зрізі 1, плюс заміна на кожен запис. Підпис не
-- змінюється: заміна приходить полем `substitute_id` у тому самому JSON.
create or replace function public.submit_leave_request(
  p_leave_type   text,
  p_relationship text,
  p_comment      text,
  p_records      jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request_id    uuid;
  v_record        jsonb;
  v_clash         public.leave_records%rowtype;
  v_substitute_id uuid;
  v_busy          text;
  v_email         text;
begin
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'Choose at least one position' using errcode = 'P0001';
  end if;

  insert into public.leave_requests (employee_id, leave_type, relationship, comment)
  values ((select auth.uid()), p_leave_type, p_relationship, p_comment)
  returning id into v_request_id;

  for v_record in select * from jsonb_array_elements(p_records)
  loop
    -- AC-LEAVE-13, AC-LEAVE-16: перетин із наявним записом тієї самої посади.
    select r.* into v_clash
    from public.leave_records as r
    where r.position_id = (v_record ->> 'position_id')::uuid
      and r.on_date = (v_record ->> 'on_date')::date
      and r.status in ('awaiting', 'returned', 'approved')
      and r.starts_at < (v_record ->> 'ends_at')::time
      and (v_record ->> 'starts_at')::time < r.ends_at
    order by r.starts_at
    limit 1;

    if found then
      raise exception 'You already have a request for this time: % %–%',
        to_char(v_clash.on_date, 'YYYY-MM-DD'),
        to_char(v_clash.starts_at, 'HH24:MI'),
        to_char(v_clash.ends_at, 'HH24:MI')
        using errcode = 'P0001';
    end if;

    v_substitute_id := nullif(v_record ->> 'substitute_id', '')::uuid;

    if v_substitute_id is not null then
      -- AC-SUBST-04: обрати можна лише того, хто є у списку замін цього працівника.
      -- Власного тексту PM для цього випадку немає: сторінка пропонує лише список,
      -- тож сюди доходить або прямий запит, або застарілий список.
      if not exists (
        select 1 from public.substitutes as s
        where s.employee_id = (select auth.uid())
          and s.substitute_id = v_substitute_id
      ) then
        raise exception 'This substitute is not on your list' using errcode = 'P0001';
      end if;

      -- AC-SUBST-05, AC-SUBST-06: зайнята заміна не приймається, і вся заявка
      -- відкочується разом із уже вставленими записами.
      v_busy := (select private.substitute_busy_at(
        v_substitute_id,
        (v_record ->> 'on_date')::date,
        (v_record ->> 'starts_at')::time,
        (v_record ->> 'ends_at')::time
      ));

      if v_busy is not null then
        v_email := (select private.profile_email(v_substitute_id));
        raise exception '% is not available at this time: %', coalesce(v_email, 'The substitute'), v_busy
          using errcode = 'P0001';
      end if;
    end if;

    insert into public.leave_records
      (request_id, position_id, on_date, starts_at, ends_at, substitute_id)
    values (
      v_request_id,
      (v_record ->> 'position_id')::uuid,
      (v_record ->> 'on_date')::date,
      (v_record ->> 'starts_at')::time,
      (v_record ->> 'ends_at')::time,
      v_substitute_id
    );
  end loop;

  return v_request_id;
end;
$$;

comment on function public.submit_leave_request(text, text, text, jsonb) is
  'Створює заявку й усі її записи в одній транзакції, разом із замінами: перетин власних записів (AC-LEAVE-13, AC-LEAVE-16) і зайнята заміна (AC-SUBST-05, AC-SUBST-06) відкочують заявку цілком.';

revoke execute on function public.submit_leave_request(text, text, text, jsonb) from public, anon;
grant execute on function public.submit_leave_request(text, text, text, jsonb) to authenticated;
