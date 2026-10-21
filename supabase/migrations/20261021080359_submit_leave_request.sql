-- Атомарне подання заявки на відпустку.
--
-- Навіщо функція, а не кілька запитів із застосунку: AC-LEAVE-16 і припущення PM
-- «A request is saved as a whole» вимагають «усі записи заявки або жодного»,
-- а в supabase-js транзакцій немає — кожен запит окрема транзакція. Усередині
-- функції перевірка перетину й вставки виконуються в одній транзакції.
--
-- security invoker: функція працює від імені користувача, тож RLS і політики
-- з 20261020203434_leave_schema.sql лишаються чинними. search_path = '' —
-- усі імена схемо-кваліфіковані (AGENTS.md → «База даних»).

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
  v_request_id uuid;
  v_record     jsonb;
  v_clash      public.leave_records%rowtype;
begin
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'Choose at least one position' using errcode = 'P0001';
  end if;

  -- Обмеження таблиці перевірять тип відпустки, ступінь спорідненості (AC-LEAVE-12)
  -- і довжину коментаря (AC-LEAVE-18); політика leave_requests_insert_own — автора.
  insert into public.leave_requests (employee_id, leave_type, relationship, comment)
  values ((select auth.uid()), p_leave_type, p_relationship, p_comment)
  returning id into v_request_id;

  for v_record in select * from jsonb_array_elements(p_records)
  loop
    -- AC-LEAVE-13, AC-LEAVE-16: перетин із наявним записом тієї самої посади.
    -- Блокують лише «awaiting», «returned» і «approved»; «rejected» і «cancelled» — ні.
    -- Дотик межами перетином не є, тому строгі нерівності.
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
      -- Виняток відкочує транзакцію цілком: жодного запису заявки не лишиться.
      raise exception 'You already have a request for this time: % %–%',
        to_char(v_clash.on_date, 'YYYY-MM-DD'),
        to_char(v_clash.starts_at, 'HH24:MI'),
        to_char(v_clash.ends_at, 'HH24:MI')
        using errcode = 'P0001';
    end if;

    insert into public.leave_records (request_id, position_id, on_date, starts_at, ends_at)
    values (
      v_request_id,
      (v_record ->> 'position_id')::uuid,
      (v_record ->> 'on_date')::date,
      (v_record ->> 'starts_at')::time,
      (v_record ->> 'ends_at')::time
    );
  end loop;

  return v_request_id;
end;
$$;

comment on function public.submit_leave_request(text, text, text, jsonb) is
  'Створює заявку й усі її записи в одній транзакції. Перетин із наявним записом тієї самої посади відкочує заявку цілком (AC-LEAVE-13, AC-LEAVE-16).';

revoke execute on function public.submit_leave_request(text, text, text, jsonb) from public, anon;
grant execute on function public.submit_leave_request(text, text, text, jsonb) to authenticated;
