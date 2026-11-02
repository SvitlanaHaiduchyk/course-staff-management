-- Зріз leave-balance: погодження з поділом на оплачувану й неоплачувану частини.
--
-- Міграції 20261026201058 і 20261102200744 уже застосовано, тож лише новий файл.
--
-- Функція рішення зі зрізу 2 отримує четвертий параметр p_with_split і дві нові
-- дії: рахує частку дня й залишок на момент рішення (AC-BALANCE-14) і
-- відмовляє в погодженні понад залишок без поділу (AC-BALANCE-16).
--
-- Чому вся логіка переїжджає в private з security definer: функція тепер пише
-- days_on_type і days_unpaid, а колонкового grant update на них authenticated
-- не має — і навмисно. Якби ми цей grant дали, менеджер міг би прямим запитом
-- проставити собі 0.00 і занизити використані дні. Тому числа рахує сама
-- функція, а назовні лишається тільки вибір «з поділом чи ні».
--
-- Усі перевірки прав усередині збережено, тож прямий виклик private-функції
-- теж нічого зайвого не дає.

-- Частка дня в сотих, half up, цілочисельно: floor((200·r + w) / (2·w)).
-- Це той самий вираз, що й dayShare у src/lib/leave/balance.ts — коментар там
-- пояснює, чому не можна рахувати з комою.
--
-- ВІДОМА МЕЖА: частка рахується для кожного запису окремо. Якщо одну дату
-- покривають ТРИ й більше записів, незалежне округлення може дати 0.99 замість
-- 1.00 (три посади по 165 хв із 495). У нашій моделі даних у працівника не
-- більше двох посад, де сума точна. Повне рішення — перераховувати всю дату
-- групою за найбільшим залишком (sharesForDate у TS) — потребує переписування
-- вже погоджених записів, тож винесено за межі цієї задачі.
create or replace function private.day_share_hundredths(
  p_record_minutes integer,
  p_working_minutes integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_working_minutes <= 0 then 0
    else least(
      (200 * p_record_minutes + p_working_minutes) / (2 * p_working_minutes),
      100
    )
  end;
$$;

revoke execute on function private.day_share_hundredths(integer, integer) from public, anon;
grant execute on function private.day_share_hundredths(integer, integer) to authenticated;

create or replace function private.decide_leave_record(
  p_record_id  uuid,
  p_decision   text,
  p_comment    text,
  p_with_split boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status      text;
  v_is_own      boolean;
  v_decides     boolean;
  v_employee_id uuid;
  v_leave_type  text;
  v_on_date     date;
  v_minutes     integer;
  v_working     integer;
  v_share       integer;
  v_remaining   integer;
  v_on_type     integer := null;
  v_unpaid      integer := null;
  v_updated     integer;
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
         (select private.decides_record(rec.id)),
         pos.employee_id,
         req.leave_type,
         rec.on_date,
         -- Хвилини ВСЕРЕДИНІ блоків розкладу, а не різниця часу: запис
         -- 08:30–15:30 на посаді з перервою 12:00–12:30 триває 390 хвилин,
         -- а не 420. Те саме робить minutesInsideBlocks у src/lib/leave.
         coalesce((
           select sum(
             greatest(0, extract(epoch from (
               least(sb.ends_at, rec.ends_at) - greatest(sb.starts_at, rec.starts_at)
             )) / 60)
           )
           from public.schedule_blocks as sb
           where sb.position_id = rec.position_id
             and sb.weekday = case when extract(isodow from rec.on_date) = 0
                                   then 7 else extract(isodow from rec.on_date)::int end
         ), 0)::integer
    into v_status, v_is_own, v_decides, v_employee_id, v_leave_type, v_on_date, v_minutes
    from public.leave_records as rec
    join public.leave_requests as req on req.id = rec.request_id
    join public.positions as pos on pos.id = rec.position_id
   where rec.id = p_record_id;

  if v_status is null then
    raise exception 'Record not found' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-18: власний запис менеджера вирішує лише адміністратор.
  if v_is_own and (select private.current_app_role()) <> 'admin' then
    raise exception 'Your own record is decided by an administrator' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-08, AC-DECIDE-09.
  if not v_decides then
    raise exception 'You cannot decide on this record' using errcode = 'P0001';
  end if;

  -- AC-DECIDE-07: інший менеджер устиг раніше.
  if v_status <> 'awaiting' then
    raise exception 'Another manager has already decided: %',
      (select private.status_label(v_status)) using errcode = 'P0001';
  end if;

  -- Частку й залишок рахуємо лише для погодження: відхилений і повернутий
  -- запис балансу не чіпають (AC-BALANCE-04, AC-BALANCE-07).
  if p_decision = 'approved' then
    v_working := private.working_minutes_on(v_employee_id, v_on_date);
    v_share := private.day_share_hundredths(v_minutes, v_working);

    -- AC-BALANCE-14: залишок береться на МОМЕНТ рішення, після всіх
    -- погоджень, зроблених між поданням і цим кліком.
    select round(
             (coalesce(b.carried_over, 0)
              + case when v_leave_type in ('sick', 'personal') then 18.00 else 0 end
              - coalesce(b.used, 0)) * 100
           )::integer
      into v_remaining
      from private.employee_balance(
             v_employee_id,
             (case when extract(month from v_on_date) >= 9
                   then extract(year from v_on_date)
                   else extract(year from v_on_date) - 1 end)::smallint
           ) as b
     where b.leave_type = v_leave_type;

    -- Типи без ліміту не перевищуються ніколи.
    if v_leave_type not in ('sick', 'personal') then
      v_remaining := null;
    end if;

    if v_remaining is not null and v_share > v_remaining then
      -- AC-BALANCE-16: понад залишок — лише з поділом.
      if not coalesce(p_with_split, false) then
        raise exception 'The % balance is %: approve with the suggested split or reject',
          (select private.leave_type_label(v_leave_type)),
          (select private.format_days(v_remaining)) using errcode = 'P0001';
      end if;
      -- AC-BALANCE-10, AC-BALANCE-19: оплачувана частина — до залишку.
      v_on_type := greatest(v_remaining, 0);
      v_unpaid := v_share - v_on_type;
    else
      v_on_type := v_share;
      v_unpaid := 0;
    end if;
  end if;

  update public.leave_records
     set status       = p_decision,
         days_on_type = v_on_type / 100.0,
         days_unpaid  = v_unpaid / 100.0
   where id = p_record_id
     and status = 'awaiting';

  get diagnostics v_updated = row_count;

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

revoke execute on function private.decide_leave_record(uuid, text, text, boolean) from public, anon;
grant execute on function private.decide_leave_record(uuid, text, text, boolean) to authenticated;

-- Підписи для повідомлень PM — дослівно як у вимогах.
create or replace function private.leave_type_label(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'sick' then 'Sick leave'
    when 'personal' then 'Personal leave'
    when 'unpaid' then 'Unpaid leave'
    when 'family_celebration' then 'Family celebration'
    else p_type
  end;
$$;

-- «50» → «0.50 day». Слово в однині навіть для 1.50 — так у AC.
create or replace function private.format_days(p_hundredths integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_hundredths / 100.0, 'FM990.00') || ' day';
$$;

revoke execute on function private.leave_type_label(text) from public, anon;
revoke execute on function private.format_days(integer) from public, anon;
grant execute on function private.leave_type_label(text) to authenticated;
grant execute on function private.format_days(integer) to authenticated;

-- Тонка обгортка: supabase.rpc() бачить лише схему public.
create or replace function public.decide_leave_record(
  p_record_id  uuid,
  p_decision   text,
  p_comment    text,
  p_with_split boolean default false
)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.decide_leave_record(p_record_id, p_decision, p_comment, p_with_split) $$;

comment on function public.decide_leave_record(uuid, text, text, boolean) is
  'Рішення по запису зі списанням частки дня й поділом понад залишок (AC-DECIDE-02, AC-BALANCE-10, AC-BALANCE-16).';

revoke execute on function public.decide_leave_record(uuid, text, text, boolean) from public, anon;
grant execute on function public.decide_leave_record(uuid, text, text, boolean) to authenticated;

-- Стару тріарну версію прибираємо, щоб не лишалося двох шляхів до рішення.
drop function if exists public.decide_leave_record(uuid, text, text);
