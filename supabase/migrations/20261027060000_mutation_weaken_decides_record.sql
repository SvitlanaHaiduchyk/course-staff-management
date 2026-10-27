-- МУТАЦІЯ (навмисне порушення) — буде скасовано revert-комітом у цьому ж PR.
--
-- Навіщо: довести, що відмовні AC тримає політика бази, а не код сторінки.
-- Прибираємо всю перевірку права з private.decides_record: тепер вона каже
-- «так» будь-кому. Якби тести зрізу 2 перевіряли лише функцію
-- public.decide_leave_record, вони лишилися б зеленими — вона перевіряє
-- право сама. Падати мають саме ті тести, що б'ють у таблицю напряму.
--
-- Очікуємо червоне: AC-DECIDE-09 і AC-DECIDE-18 у tests/db/decisions.test.ts.
create or replace function private.decides_record(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select true
$$;
