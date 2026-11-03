-- Підпис працівника для списку рішень: ім'я, а якщо його немає — пошта.
--
-- Хелпер у схемі private, бо читає profiles повз політики: менеджер бачить
-- профілі лише своїх посад, а в історії рішень трапляються й чужі записи,
-- які вже вирішив адміністратор.
create or replace function private.employee_display_name(p_employee_id uuid)
returns text
language sql
stable
security definer
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email, '—')
  from public.profiles as p
  where p.id = p_employee_id;
$$;

revoke execute on function private.employee_display_name(uuid) from public, anon;
grant execute on function private.employee_display_name(uuid) to authenticated;
