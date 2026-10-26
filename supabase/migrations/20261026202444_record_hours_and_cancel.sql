-- Зріз leave-decision, частина працівника: години, скасування, повторне подання.
--
-- План — openspec/changes/impl-leave-decision/design.md, задача 2.
--
-- До рішення працівник може змінити ЛИШЕ години власного запису, скасувати його
-- або повторно подати повернутий. Дату, посаду й тип відпустки — ні: їх і так
-- немає в колонкових grant (AC-DECIDE-21 на рівні бази).

-- ---------------------------------------------------------------------------
-- Що працівник може зі своїм записом
-- ---------------------------------------------------------------------------
-- Застосовану міграцію не редагуємо — політику зрізу 1 замінюємо тут.
-- Нове порівняно з 20261020203434_leave_schema.sql: with check пускає ще
-- 'cancelled', щоб працівник міг скасувати запис (AC-DECIDE-13, AC-DECIDE-17).
--
-- using лишає 'awaiting' і 'returned', тож:
--   AC-DECIDE-12 — погоджений запис під update не підпадає;
--   AC-DECIDE-17 — скасований теж, тобто повторно подати його не можна;
--   AC-DECIDE-06 — повернутий можна виправити й подати знову ('returned' → 'awaiting').
-- 'approved' і 'rejected' у with check відсутні: працівник не вирішує (AC-DECIDE-09).
drop policy leave_records_update_own_awaiting on public.leave_records;

create policy leave_records_update_own_pending
  on public.leave_records for update to authenticated
  using (
    (select private.owns_record(request_id))
    and status in ('awaiting', 'returned')
  )
  with check (
    (select private.owns_record(request_id))
    and status in ('awaiting', 'returned', 'cancelled')
  );

-- ---------------------------------------------------------------------------
-- Зміна годин
-- ---------------------------------------------------------------------------
-- security invoker: політика вище лишається чинною, функція нічого не обходить.
-- Межі розкладу перевіряє застосунок (src/lib/leave/validate.ts) — як і при
-- поданні заявки; база відповідає за перетин, бо лише вона бачить усі записи
-- в один момент часу.
create or replace function public.update_record_hours(
  p_record_id  uuid,
  p_starts_at  time,
  p_ends_at    time,
  p_resubmit   boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status      text;
  v_position_id uuid;
  v_on_date     date;
  v_clash       public.leave_records%rowtype;
  v_updated     integer;
begin
  if p_ends_at <= p_starts_at then
    raise exception 'The end must be later than the start' using errcode = 'P0001';
  end if;

  select rec.status, rec.position_id, rec.on_date
    into v_status, v_position_id, v_on_date
    from public.leave_records as rec
   where rec.id = p_record_id
     and (select private.owns_record(rec.request_id));

  if v_status is null then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-12: погоджений запис уже не змінюють.
  if v_status = 'approved' then
    raise exception 'This record is already approved and cannot be changed' using errcode = 'P0001';
  end if;

  if v_status not in ('awaiting', 'returned') then
    raise exception 'Only a record awaiting a decision can be changed' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-22: перетин із ІНШИМИ записами тієї самої посади на ту саму дату.
  -- Сам із собою запис не перевіряється — припущення PM («not checked for
  -- overlap against itself»), тому `rec.id <> p_record_id`.
  select rec.* into v_clash
  from public.leave_records as rec
  where rec.id <> p_record_id
    and rec.position_id = v_position_id
    and rec.on_date = v_on_date
    and rec.status in ('awaiting', 'returned', 'approved')
    and rec.starts_at < p_ends_at
    and p_starts_at < rec.ends_at
  order by rec.starts_at
  limit 1;

  if found then
    raise exception 'You already have a request for this time: % %–%',
      to_char(v_clash.on_date, 'YYYY-MM-DD'),
      to_char(v_clash.starts_at, 'HH24:MI'),
      to_char(v_clash.ends_at, 'HH24:MI')
      using errcode = 'P0001';
  end if;

  -- AC-DECIDE-06: повернутий запис разом із виправленням повертається «на розгляд».
  update public.leave_records
     set starts_at = p_starts_at,
         ends_at   = p_ends_at,
         status    = case when p_resubmit then 'awaiting' else status end
   where id = p_record_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.update_record_hours(uuid, time, time, boolean) is
  'Зміна годин власного запису до рішення, з перевіркою перетину без самого себе (AC-DECIDE-16, AC-DECIDE-22) і повторним поданням повернутого (AC-DECIDE-06).';

revoke execute on function public.update_record_hours(uuid, time, time, boolean) from public, anon;
grant execute on function public.update_record_hours(uuid, time, time, boolean) to authenticated;
