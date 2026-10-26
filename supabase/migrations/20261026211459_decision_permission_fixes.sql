-- Виправлення за рев'ю CodeRabbit на PR #25 (зріз leave-decision).
--
-- Міграцію 20261026201058_leave_decisions.sql уже застосовано (db-deploy після
-- merge #25), тож редагувати її не можна — лише новий файл.

-- ---------------------------------------------------------------------------
-- 1. Менеджер має бачити, ЧИЙ це запис
-- ---------------------------------------------------------------------------
-- Основний сценарій вимоги, крок 2: «The manager reviews a record: employee,
-- position, date, hours, leave type, employee's comment». Політика
-- profiles_select_own_or_admin зі зрізу 1 віддає лише власний профіль, тож у
-- списку «Awaiting decision» стояло б «—» замість імені працівника.
--
-- Окрема політика (permissive, додається до наявних) відкриває менеджеру
-- профілі лише тих, чиї посади він веде, — і нікого більше.
create policy profiles_select_managed_employees
  on public.profiles for select to authenticated
  using (
    exists (
      select 1 from public.positions as pos
      where pos.employee_id = public.profiles.id
        and (select private.manages_position(pos.id))
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Саме лише членство в position_managers права не дає
-- ---------------------------------------------------------------------------
-- Було: досить рядка в position_managers. Тоді людина з роллю employee, яку
-- туди вписали, ухвалювала б рішення. Тепер потрібна ще й роль manager —
-- роль беремо з profiles, ніколи з user_metadata.
--
-- Решта правила без змін:
--   адміністратор                               → так (AC-DECIDE-10, AC-DECIDE-19)
--   менеджер посади, НЕ власник                 → так (AC-DECIDE-01)
--   менеджер і власник                          → ні  (AC-DECIDE-18)
--   менеджер чужої посади                       → ні  (AC-DECIDE-08)
--   працівник без ролі                          → ні  (AC-DECIDE-09)
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
