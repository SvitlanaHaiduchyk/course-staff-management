-- Знаменник частки дня втрачає закриті шкільним календарем хвилини.
--
-- Вимоги: requirements/04-school-calendar.md (знімок 2026-11-18), AC-CAL-06;
-- план: openspec/changes/impl-school-calendar/tasks.md, задача 6.
--
-- AC-CAL-06: «цілий день» у скорочений день — це 1.00, а не частка від повного
-- дня. Досягається не множником у коді, а тим, що знаменник і чисельник
-- рахуються за ОДНИМ розкладом: обрізаним. Запис на 08:30–12:00 при закритті з
-- 12:00 має 210 хвилин, і робочих хвилин того дня теж 210 → рівно 1.00.
--
-- AC-CAL-20 ця міграція НЕ порушує: частка лишається записаною в leave_records
-- у момент погодження (колонки days_on_type і days_unpaid, рішення зрізу WS6
-- за AC-BALANCE-14). Новий знаменник діє лише на записи, які погоджують ПІСЛЯ
-- додавання закриття; уже погоджені не перераховуються ніколи.
--
-- Міняємо лише тіло private.working_minutes_on: сигнатура, права й обгортка
-- public.working_minutes_on лишаються ті самі, тож private.decide_leave_record
-- переписувати не доводиться — вона й далі кличе ту саму функцію.

-- ---------------------------------------------------------------------------
-- Робочі хвилини дати, крім закритих
-- ---------------------------------------------------------------------------
-- Правило обрізання — те саме, що в TypeScript (src/lib/leave/closure.ts,
-- blocksAfterClosure) і те саме, що задав PM у AC-CAL-04:
--
--   • блок, що починається в час закриття або пізніше, — закритий цілком;
--   • блок, що триває в цей час, закінчується цим часом;
--   • блок, що закінчується рівно в час закриття, лишається цілим.
--
-- Для закриття на цілий день private.closed_from повертає 00:00, тож жоден
-- блок не починається раніше й сума дорівнює нулю.
create or replace function private.working_minutes_on(p_employee_id uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select private.may_see_balance(p_employee_id)) then coalesce((
    select sum(
             extract(
               epoch from (
                 least(sb.ends_at, coalesce((select private.closed_from(p_date)), sb.ends_at))
                 - sb.starts_at
               )
             ) / 60
           )::integer
    from public.schedule_blocks as sb
    join public.positions as pos on pos.id = sb.position_id
    where pos.employee_id = p_employee_id
      and sb.weekday = case when extract(isodow from p_date) = 0
                            then 7 else extract(isodow from p_date)::int end
      -- Блок цілком після часу закриття не дає хвилин і не має давати
      -- від'ємних: відкидаємо його тут, а не покладаємося на greatest(…, 0).
      and sb.starts_at < coalesce((select private.closed_from(p_date)), sb.ends_at)
  ), 0) else 0 end;
$$;

revoke execute on function private.working_minutes_on(uuid, date) from public, anon;
grant execute on function private.working_minutes_on(uuid, date) to authenticated;
