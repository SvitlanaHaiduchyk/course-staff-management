-- МУТАЦІЯ (навмисне порушення) — буде скасовано revert-комітом у цьому ж PR.
--
-- Мутацію A (private.decides_record → select true) скасовано: функція знову
-- правильна. Тепер ламаємо інше — прибираємо з using політики умову
-- status = 'awaiting'. Саме вона робить рішення остаточним: після рішення
-- першого менеджера рядок уже не підпадає під update другого.
--
-- Очікуємо червоне: AC-DECIDE-07 у tests/db/decisions.test.ts.
drop policy leave_records_update_decision on public.leave_records;

create policy leave_records_update_decision
  on public.leave_records for update to authenticated
  using ((select private.decides_record(id)))
  with check (
    status in ('approved', 'rejected', 'returned')
    and (select private.decides_record(id))
  );
