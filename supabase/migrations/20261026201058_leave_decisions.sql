-- Зріз leave-decision: рішення менеджера по записах відпустки.
--
-- Плани й обґрунтування — openspec/changes/impl-leave-decision/design.md.
-- Головне рішення: право вирішувати залежить не лише від ролі, а й від того, ЧИЙ це
-- запис (AC-DECIDE-18: менеджер не вирішує власні записи). Тому перевірка — окремий
-- хелпер private.decides_record, а не `role = 'manager'` у політиці.
--
-- Роль читаємо з profiles через private.current_app_role(), ніколи з user_metadata.

-- ---------------------------------------------------------------------------
-- Історія рішень
-- ---------------------------------------------------------------------------
-- Окремі рядки, а не колонки в leave_records: запис проходить цикл
-- «повернуто → виправлено → погоджено», і кожне рішення має лишитися видимим
-- (AC-DECIDE-15). Коментар для працівника — коментар останнього рішення.
create table public.leave_decisions (
  id         uuid primary key default gen_random_uuid(),
  record_id  uuid not null references public.leave_records (id) on delete cascade,
  decided_by uuid not null references public.profiles (id),
  decision   text not null,
  comment    text,
  decided_at timestamptz not null default now(),
  constraint leave_decisions_decision_check
    check (decision in ('approved', 'rejected', 'returned')),
  constraint leave_decisions_comment_length_check
    check (comment is null or char_length(comment) <= 500),
  -- AC-DECIDE-04: повернення без коментаря база не приймає. Друга лінія після дії.
  constraint leave_decisions_return_needs_comment_check
    check (decision <> 'returned' or (comment is not null and btrim(comment) <> ''))
);

create index leave_decisions_record_id_idx on public.leave_decisions (record_id);

alter table public.leave_decisions enable row level security;

revoke all on table public.leave_decisions from anon, authenticated;
-- Жодного update і delete нікому з authenticated: рішення не редагують і не видаляють.
grant select, insert on table public.leave_decisions to authenticated;
grant select, insert, update, delete on table public.leave_decisions to service_role;

-- ---------------------------------------------------------------------------
-- Хто має право вирішувати
-- ---------------------------------------------------------------------------
-- адміністратор                               → так (AC-DECIDE-10, AC-DECIDE-19)
-- відповідальний менеджер посади, не власник  → так (AC-DECIDE-01)
-- відповідальний менеджер і власник           → ні  (AC-DECIDE-18)
-- менеджер чужої посади                       → ні  (AC-DECIDE-08)
-- працівник без ролі                          → ні  (AC-DECIDE-09)
create or replace function private.decides_record(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leave_records as rec
    join public.leave_requests as req on req.id = rec.request_id
    where rec.id = p_record_id
      and (
        (select private.current_app_role()) = 'admin'
        or (
          -- Роль обов'язкова: самого рядка в position_managers замало. Інакше
          -- людина з роллю employee, яку туди вписали, вирішувала б записи.
          (select private.current_app_role()) = 'manager'
          and req.employee_id <> (select auth.uid())
          and exists (
            select 1 from public.position_managers as pm
            where pm.position_id = rec.position_id
              and pm.manager_id = (select auth.uid())
          )
        )
      )
  );
$$;

revoke execute on function private.decides_record(uuid) from public, anon;
grant execute on function private.decides_record(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Права на leave_records і leave_decisions
-- ---------------------------------------------------------------------------
-- Колонковий grant: до starts_at і ends_at додаємо лише status. request_id,
-- position_id і on_date лишаються без update назавжди — це AC-DECIDE-21 на рівні
-- бази: дату й посаду не змінити навіть прямим запитом повз сторінки.
grant update (starts_at, ends_at, status) on table public.leave_records to authenticated;

-- AC-DECIDE-15: історію бачать ті самі, хто бачить сам запис, — власник,
-- відповідальний менеджер посади, адміністратор.
create policy leave_decisions_select_visible_records
  on public.leave_decisions for select to authenticated
  using (
    exists (
      select 1 from public.leave_records as rec
      where rec.id = public.leave_decisions.record_id
        and (
          (select private.owns_record(rec.request_id))
          or (select private.manages_position(rec.position_id))
          or (select private.current_app_role()) = 'admin'
        )
    )
  );

-- Свого імені під чужим рішенням не підставити: decided_by — завжди сам користувач.
create policy leave_decisions_insert_decider
  on public.leave_decisions for insert to authenticated
  with check (
    decided_by = (select auth.uid())
    and (select private.decides_record(record_id))
  );

-- Основний сценарій, крок 2: менеджер бачить, ЧИЙ це запис. Політика
-- profiles_select_own_or_admin зі зрізу 1 віддає лише власний профіль, тож у
-- списку стояло б «—» замість імені. Окрема політика відкриває менеджеру
-- профілі тих, чиї посади він веде, — і нікого більше.
create policy profiles_select_managed_employees
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.positions as pos
      where pos.employee_id = public.profiles.id
        and (select private.manages_position(pos.id))
    )
  );

-- AC-DECIDE-20: менеджер має побачити тип відпустки й коментар працівника, а їх
-- зберігає leave_requests. У зрізі 1 цю таблицю віддавали лише власнику й
-- адміністратору: менеджер бачив запис, але не заявку. Окрема політика (а не
-- правка застосованої міграції) додає відповідального менеджера будь-якої
-- посади з цієї заявки.
create policy leave_requests_select_managed
  on public.leave_requests for select to authenticated
  using (
    exists (
      select 1 from public.leave_records as rec
      where rec.request_id = public.leave_requests.id
        and (select private.manages_position(rec.position_id))
    )
  );

-- AC-DECIDE-07: після рішення першого менеджера рядок уже не в «awaiting»,
-- тож під update другого не підпадає. Повідомлення дає функція, база лише не дає змінити.
-- AC-DECIDE-08, AC-DECIDE-09, AC-DECIDE-18 — через private.decides_record.
create policy leave_records_update_decision
  on public.leave_records for update to authenticated
  using (
    status = 'awaiting'
    and (select private.decides_record(id))
  )
  with check (
    status in ('approved', 'rejected', 'returned')
    and (select private.decides_record(id))
  );

-- ---------------------------------------------------------------------------
-- Рішення — однією транзакцією зі слідом в історії
-- ---------------------------------------------------------------------------
-- Назви статусів для повідомлень — дослівно як у вимогах PM.
create or replace function private.status_label(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'awaiting'  then 'Awaiting decision'
    when 'approved'  then 'Approved'
    when 'rejected'  then 'Rejected'
    when 'returned'  then 'Returned for revision'
    when 'cancelled' then 'Cancelled'
    else p_status
  end;
$$;

revoke execute on function private.status_label(text) from public, anon;
grant execute on function private.status_label(text) to authenticated;

-- security invoker: RLS і політики лишаються чинними, функція нічого не обходить.
-- Статус і рядок історії в одній транзакції — рішення без сліду неможливе
-- (те саме міркування, що й в ADR 0001).
--
-- Усі перевірки — ДО update. Інакше RLS кидає власну помилку
-- «new row violates row-level security policy» замість тексту PM: для власного
-- запису менеджера рядок проходить using політики власника й падає вже на
-- with check (AC-DECIDE-18).
create or replace function public.decide_leave_record(
  p_record_id uuid,
  p_decision  text,
  p_comment   text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status  text;
  v_is_own  boolean;
  v_decides boolean;
  v_updated integer;
begin
  if p_decision not in ('approved', 'rejected', 'returned') then
    raise exception 'Unknown decision' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-04: коментар обов'язковий лише для повернення.
  if p_decision = 'returned' and (p_comment is null or btrim(p_comment) = '') then
    raise exception 'Tell the employee what to fix' using errcode = 'P0001';
  end if;

  select rec.status,
         (select private.owns_record(rec.request_id)),
         (select private.decides_record(rec.id))
    into v_status, v_is_own, v_decides
    from public.leave_records as rec
   where rec.id = p_record_id;

  -- Запису немає або політика select його не віддає (AC-DECIDE-08: менеджер
  -- чужої посади). Не кажемо, чи існує чужий запис.
  if v_status is null then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-18: власний запис менеджера вирішує лише адміністратор.
  if v_is_own and (select private.current_app_role()) <> 'admin' then
    raise exception 'Your own record is decided by an administrator' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-09 і решта випадків без права.
  if not v_decides then
    raise exception 'You cannot decide on this record' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-07: інший менеджер устиг раніше.
  if v_status <> 'awaiting' then
    raise exception 'Another manager has already decided: %',
      (select private.status_label(v_status)) using errcode = 'P0001';
  end if;

  update public.leave_records
     set status = p_decision
   where id = p_record_id;

  get diagnostics v_updated = row_count;

  -- Між перевіркою і update встиг інший менеджер: політика update вимагає
  -- status = 'awaiting', тож рядок просто не зачепило.
  if v_updated = 0 then
    select rec.status into v_status
      from public.leave_records as rec where rec.id = p_record_id;
    raise exception 'Another manager has already decided: %',
      (select private.status_label(coalesce(v_status, p_decision))) using errcode = 'P0001';
  end if;

  insert into public.leave_decisions (record_id, decided_by, decision, comment)
  values (p_record_id, (select auth.uid()), p_decision, nullif(btrim(p_comment), ''));
end;
$$;

comment on function public.decide_leave_record(uuid, text, text) is
  'Рішення менеджера чи адміністратора по запису: статус і рядок історії в одній транзакції (AC-DECIDE-02, AC-DECIDE-15).';

revoke execute on function public.decide_leave_record(uuid, text, text) from public, anon;
grant execute on function public.decide_leave_record(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Рішення без сліду в історії неможливе
-- ---------------------------------------------------------------------------
-- Політика update дозволяє адміністратору змінити статус (AC-DECIDE-10), і
-- прямий запит повз public.decide_leave_record зробив би це без рядка історії,
-- якої вимагає AC-DECIDE-15. Відкладений constraint trigger спрацьовує на
-- commit — тобто вже після того, як функція вставила рядок історії, — і валить
-- транзакцію, якщо сліду немає.
--
-- `decided_at >= now()`: now() — час початку транзакції, тож умову проходить
-- лише рядок, вставлений у цій самій транзакції, а не торішнє рішення.
create or replace function private.require_decision_trail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('approved', 'rejected', 'returned')
     and new.status is distinct from old.status
     and not exists (
       select 1 from public.leave_decisions as d
       where d.record_id = new.id
         and d.decision = new.status
         and d.decided_at >= now()
     )
  then
    raise exception 'A decision must be recorded in the history' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger leave_records_decision_trail
  after update on public.leave_records
  deferrable initially deferred
  for each row
  execute function private.require_decision_trail();
