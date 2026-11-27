-- Зріз leave-cancellation: скасування погодженого запису через менеджера.
--
-- План і обґрунтування — openspec/changes/impl-cancel-approved/design.md.
--
-- Головне рішення: запит на скасування живе в ОКРЕМІЙ таблиці, а статус запису
-- до рішення менеджера не змінюється. Так вимагає припущення PM: запис із
-- позначкою «Cancellation requested» і далі рахується як «Approved» — у залишку,
-- для перетинів, для зайнятості заміни й для закриття дня (AC-CAL-07). Колонка
-- статусу «cancellation_requested» зламала б усе це одним рядком.
--
-- Дні повертаються самі: private.employee_balance рахує лише записи зі статусом
-- 'approved', тож перехід у 'cancelled' повертає і частку типу, і Unpaid-частину
-- розділеного запису (AC-CANCEL-02, AC-CANCEL-07). Те саме з закриттям дня
-- (AC-CANCEL-13): перевірка дивиться лише на 'awaiting', 'returned', 'approved'.

-- ---------------------------------------------------------------------------
-- Запити на скасування
-- ---------------------------------------------------------------------------
create table public.leave_cancellations (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.leave_records (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  reason       text not null,
  requested_at timestamptz not null default now(),
  -- Рішення менеджера; null — запит іще відкритий (позначка «Cancellation requested»).
  decision     text,
  decided_by   uuid references public.profiles (id),
  comment      text,
  decided_at   timestamptz,
  constraint leave_cancellations_reason_not_empty_check
    check (btrim(reason) <> '' and char_length(reason) <= 500),
  constraint leave_cancellations_decision_check
    check (decision is null or decision in ('confirmed', 'declined')),
  constraint leave_cancellations_comment_length_check
    check (comment is null or char_length(comment) <= 500),
  -- AC-CANCEL-04: відхилення без коментаря база не приймає. Друга лінія після функції.
  constraint leave_cancellations_decline_needs_comment_check
    check (decision is distinct from 'declined'
           or (comment is not null and btrim(comment) <> '')),
  -- Рішення без того, хто його зробив, і без часу — неможливе.
  constraint leave_cancellations_decided_fields_check
    check ((decision is null and decided_by is null and decided_at is null)
           or (decision is not null and decided_by is not null and decided_at is not null))
);

create index leave_cancellations_record_id_idx on public.leave_cancellations (record_id);

-- AC-CANCEL-06: один ВІДКРИТИЙ запит на запис. Вирішені рядки лишаються в історії,
-- тож унікальність часткова.
create unique index leave_cancellations_one_open_idx
  on public.leave_cancellations (record_id)
  where decision is null;

alter table public.leave_cancellations enable row level security;

revoke all on table public.leave_cancellations from anon, authenticated;
grant select, insert on table public.leave_cancellations to authenticated;
-- Колонковий grant: працівник не може «вирішити» власний запит, навіть прямим
-- запитом, — під update підпадають лише поля рішення.
grant update (decision, decided_by, comment, decided_at)
  on table public.leave_cancellations to authenticated;
grant select, insert, update, delete on table public.leave_cancellations to service_role;

-- AC-CANCEL-01: запит бачать ті самі, хто бачить сам запис.
create policy leave_cancellations_select_visible_records
  on public.leave_cancellations for select to authenticated
  using (
    exists (
      select 1 from public.leave_records as rec
      where rec.id = public.leave_cancellations.record_id
        and (
          (select private.owns_record(rec.request_id))
          or (select private.manages_position(rec.position_id))
          or (select private.current_app_role()) = 'admin'
        )
    )
  );

-- AC-CANCEL-10: просити скасування можна лише для власного запису, і лише від
-- свого імені. Межі «погоджений» і «сьогодні або пізніше» — у функції нижче й
-- продубльовані тут, щоб прямий insert повз неї теж не пройшов.
create policy leave_cancellations_insert_own
  on public.leave_cancellations for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and decision is null
    and exists (
      select 1 from public.leave_records as rec
      where rec.id = record_id
        and (select private.owns_record(rec.request_id))
        and rec.status = 'approved'
        and rec.on_date >= (now() at time zone 'Europe/Kyiv')::date
    )
  );

-- AC-CANCEL-08: менеджер скасовує сам — запиту працівника не було, тож рядок
-- історії вставляє він. Лише одразу вирішений ('confirmed') і лише для записів,
-- які він має право вирішувати; відкритий запит від чужого імені так не створити.
create policy leave_cancellations_insert_decider_note
  on public.leave_cancellations for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and decided_by = (select auth.uid())
    and decision = 'confirmed'
    and (select private.decides_record(record_id))
  );

-- AC-CANCEL-11: вирішує лише той, хто має право вирішувати цей запис, — той самий
-- хелпер, що й для рішень, тож AC-DECIDE-18 (власний запис менеджера) діє й тут.
create policy leave_cancellations_update_decider
  on public.leave_cancellations for update to authenticated
  using (
    decision is null
    and (select private.decides_record(record_id))
  )
  with check (
    decision in ('confirmed', 'declined')
    and decided_by = (select auth.uid())
    and (select private.decides_record(record_id))
  );

-- ---------------------------------------------------------------------------
-- Скасування самого запису
-- ---------------------------------------------------------------------------
-- Чому НЕ нова політика update на leave_records: політики permissive, тобто
-- `using` однієї складається з `with check` іншої через OR. Політика з
-- `using (status = 'approved' …)` відкрила б рядок і для наявної
-- leave_records_update_decision, чий `with check` пускає 'rejected', — і
-- менеджер зміг би прямим запитом відхилити вже погоджений запис (це ловить
-- `AC-DECIDE-07` у tests/db/decisions.test.ts).
--
-- Тому перехід 'approved' → 'cancelled' робить одна функція в схемі private із
-- security definer: вона сама перевіряє право (private.decides_record) і статус,
-- а RLS на leave_records лишається рівно такою, якою була.
create or replace function private.set_record_cancelled(p_record_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if not (select private.decides_record(p_record_id)) then
    raise exception 'You cannot decide on this record' using errcode = 'P0001';
  end if;

  update public.leave_records
     set status = 'cancelled'
   where id = p_record_id
     and status = 'approved';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function private.set_record_cancelled(uuid) from public, anon;
grant execute on function private.set_record_cancelled(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Дія 1: працівник просить скасувати погоджений запис
-- ---------------------------------------------------------------------------
-- security invoker: RLS лишається чинною. Усі перевірки ДО запису — інакше
-- замість тексту PM людина побачила б «new row violates row-level security policy».
create or replace function public.request_record_cancellation(
  p_record_id uuid,
  p_reason    text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status  text;
  v_on_date date;
  v_is_own  boolean;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Tell your manager why you cancel' using errcode = 'P0001';
  end if;

  select rec.status, rec.on_date, (select private.owns_record(rec.request_id))
    into v_status, v_on_date, v_is_own
    from public.leave_records as rec
   where rec.id = p_record_id;

  -- AC-CANCEL-10: чужий запис. Не кажемо, чи він існує.
  if v_status is null or not v_is_own then
    raise exception 'You can cancel only your own records' using errcode = 'P0001';
  end if;

  if v_status <> 'approved' then
    raise exception 'Only approved records are cancelled this way' using errcode = 'P0001';
  end if;

  -- AC-CANCEL-05: «сьогодні або пізніше» — за київською датою (припущення PM).
  if v_on_date < (now() at time zone 'Europe/Kyiv')::date then
    raise exception 'Records in the past cannot be cancelled' using errcode = 'P0001';
  end if;

  -- AC-CANCEL-06: другий запит не створюється.
  if exists (
    select 1 from public.leave_cancellations as c
    where c.record_id = p_record_id and c.decision is null
  ) then
    raise exception 'Cancellation has already been requested' using errcode = 'P0001';
  end if;

  insert into public.leave_cancellations (record_id, requested_by, reason)
  values (p_record_id, (select auth.uid()), btrim(p_reason));
end;
$$;

comment on function public.request_record_cancellation(uuid, text) is
  'Запит працівника на скасування власного погодженого запису (AC-CANCEL-01, AC-CANCEL-05, AC-CANCEL-06, AC-CANCEL-10).';

revoke execute on function public.request_record_cancellation(uuid, text) from public, anon;
grant execute on function public.request_record_cancellation(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Дія 2: менеджер підтверджує або відхиляє запит
-- ---------------------------------------------------------------------------
-- Підтвердження — це рішення ПЛЮС зміна статусу запису; у supabase-js немає
-- транзакцій, тож обидві дії в одній функції (AGENTS.md, «База даних»).
create or replace function public.decide_record_cancellation(
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
  v_request_id uuid;
  v_status     text;
  v_decides    boolean;
  v_updated    integer;
begin
  if p_decision not in ('confirmed', 'declined') then
    raise exception 'Unknown decision' using errcode = 'P0001';
  end if;

  -- AC-CANCEL-04: відхилення без коментаря не приймаємо.
  if p_decision = 'declined' and (p_comment is null or btrim(p_comment) = '') then
    raise exception 'Tell the employee why the cancellation is declined' using errcode = 'P0001';
  end if;

  select c.id, rec.status, (select private.decides_record(rec.id))
    into v_request_id, v_status, v_decides
    from public.leave_cancellations as c
    join public.leave_records as rec on rec.id = c.record_id
   where c.record_id = p_record_id
     and c.decision is null;

  if v_request_id is null then
    raise exception 'No cancellation has been requested' using errcode = 'P0001';
  end if;

  -- AC-CANCEL-11: менеджер чужої посади.
  if not v_decides then
    raise exception 'You cannot decide on this record' using errcode = 'P0001';
  end if;

  update public.leave_cancellations
     set decision   = p_decision,
         decided_by = (select auth.uid()),
         comment    = nullif(btrim(p_comment), ''),
         decided_at = now()
   where id = v_request_id
     and decision is null;

  get diagnostics v_updated = row_count;

  -- Між перевіркою і update устиг інший менеджер.
  if v_updated = 0 then
    raise exception 'This cancellation has already been decided' using errcode = 'P0001';
  end if;

  -- AC-CANCEL-02, AC-CANCEL-07: підтвердження скасовує запис, і дні повертаються
  -- самі — залишок рахує лише записи зі статусом 'approved'.
  if p_decision = 'confirmed' then
    v_updated := (select private.set_record_cancelled(p_record_id));

    if v_updated = 0 then
      raise exception 'The record is no longer approved: %',
        (select private.status_label(v_status)) using errcode = 'P0001';
    end if;
  end if;
end;
$$;

comment on function public.decide_record_cancellation(uuid, text, text) is
  'Рішення менеджера по запиту на скасування: статус запису й рядок історії в одній транзакції (AC-CANCEL-02, AC-CANCEL-03, AC-CANCEL-04).';

revoke execute on function public.decide_record_cancellation(uuid, text, text) from public, anon;
grant execute on function public.decide_record_cancellation(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Дія 3: менеджер скасовує погоджений запис сам, із приміткою
-- ---------------------------------------------------------------------------
create or replace function public.cancel_record_with_note(
  p_record_id uuid,
  p_note      text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status  text;
  v_decides boolean;
  v_updated integer;
begin
  -- AC-CANCEL-09: без примітки не скасовуємо.
  if p_note is null or btrim(p_note) = '' then
    raise exception 'Tell the employee why the record is cancelled' using errcode = 'P0001';
  end if;

  select rec.status, (select private.decides_record(rec.id))
    into v_status, v_decides
    from public.leave_records as rec
   where rec.id = p_record_id;

  if v_status is null then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;

  if not v_decides then
    raise exception 'You cannot decide on this record' using errcode = 'P0001';
  end if;

  if v_status <> 'approved' then
    raise exception 'Only approved records are cancelled this way' using errcode = 'P0001';
  end if;

  -- Слід скасування — рядок у leave_cancellations, одразу вирішений: запиту
  -- працівника не було, а примітку менеджера працівник має побачити (AC-CANCEL-08).
  insert into public.leave_cancellations
    (record_id, requested_by, reason, decision, decided_by, comment, decided_at)
  values
    (p_record_id, (select auth.uid()), 'Cancelled by the manager',
     'confirmed', (select auth.uid()), btrim(p_note), now());

  v_updated := (select private.set_record_cancelled(p_record_id));

  if v_updated = 0 then
    raise exception 'The record is no longer approved' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.cancel_record_with_note(uuid, text) is
  'Скасування погодженого запису менеджером із приміткою працівникові (AC-CANCEL-08, AC-CANCEL-09).';

revoke execute on function public.cancel_record_with_note(uuid, text) from public, anon;
grant execute on function public.cancel_record_with_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Підтверджене скасування без скасованого запису неможливе
-- ---------------------------------------------------------------------------
-- Колонковий grant і політика update дозволяють відповідальному менеджеру
-- поставити decision = 'confirmed' ПРЯМИМ запитом, повз
-- public.decide_record_cancellation. Тоді запит виглядав би вирішеним, а запис
-- лишався б «Approved» — і дні не повернулися б (знайшло рев'ю CodeRabbit
-- на PR 112).
--
-- Відкладений constraint trigger спрацьовує на commit, тобто вже після того,
-- як функція скасувала запис, і валить транзакцію, якщо цього не сталося.
create or replace function private.require_cancelled_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.decision = 'confirmed'
     and (TG_OP = 'INSERT' or new.decision is distinct from old.decision)
     and not exists (
       select 1 from public.leave_records as rec
       where rec.id = new.record_id
         and rec.status = 'cancelled'
     )
  then
    raise exception 'A confirmed cancellation must cancel the record' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger leave_cancellations_confirmed_cancels_record
  after insert or update on public.leave_cancellations
  deferrable initially deferred
  for each row
  execute function private.require_cancelled_record();
