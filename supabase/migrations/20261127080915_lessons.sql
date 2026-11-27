-- Уроки й інші заняття посади: що саме людина робить усередині робочих годин.
--
-- Вимог PM на це НЕМАЄ: у знімку requirements/ є лише `schedule_blocks` —
-- блоки робочого часу посади, на хвилинах яких тримається знаменник балансу
-- (AC-LEAVE-01, AC-LEAVE-02, AC-LEAVE-15, private.working_minutes_on).
-- Рішення й межі — docs/decisions/0004-lessons-as-a-layer.md; питання до PM
-- підготовлено окремо (docs/spec-reading.md).
--
-- ГОЛОВНЕ: уроки — це ШАР ПОВЕРХ робочих годин, а не їх заміна.
-- `schedule_blocks` ця міграція не чіпає взагалі, жодна функція балансу про
-- `lessons` не знає, і жоден AC від цієї таблиці не залежить. Інакше перерва
-- між уроками перестала б бути робочим часом, і вже прийняті AC порахували б
-- частку дня інакше — без нового AC від PM так робити не можна.

create table public.lessons (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions (id) on delete cascade,
  weekday     smallint not null,
  starts_at   time not null,
  ends_at     time not null,
  -- Що саме: «Maths», «Algebra», «Нарада кафедри». Вид заняття окремим полем
  -- не робимо: PM не давав переліку видів, а вигадувати його тут не можна.
  subject     text not null,
  -- Клас: «4-A», «8A». null — заняття без класу (нарада, чергування).
  form        text,
  created_at  timestamptz not null default now(),

  constraint lessons_weekday_check check (weekday between 1 and 7),
  -- Як і в schedule_blocks: початок включено, кінець — ні.
  constraint lessons_order_check check (ends_at > starts_at),
  constraint lessons_subject_check check (length(btrim(subject)) between 1 and 100),
  constraint lessons_form_check check (form is null or length(btrim(form)) between 1 and 20)
);

-- Заборони на перетин уроків тут НЕМАЄ навмисно. Два заняття в той самий час
-- виглядають помилкою, але правила про це PM не давав, а обмеження в базі —
-- це правило. Показ до цього готовий: смуги, що перетинаються, розкладаються
-- по доріжках тим самим `assignLanes`, що й дві посади в ті самі години.

comment on table public.lessons is
  'Заняття посади на день тижня (урок, нарада) усередині робочих годин. Шар показу: баланс відпусток його не рахує.';
comment on column public.lessons.form is
  'Клас, у якому відбувається заняття; null — заняття без класу.';

create index lessons_position_idx on public.lessons (position_id, weekday);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lessons enable row level security;
revoke all on table public.lessons from anon, authenticated;

-- Автогрантів немає — видаємо явно. update лише по колонках вмісту: ні id, ні
-- position_id змінити не можна, тож заняття не «переїде» на іншу посаду навіть
-- у межах уже дозволеного рядка.
grant select, insert, delete on table public.lessons to authenticated;
grant update (weekday, starts_at, ends_at, subject, form) on table public.lessons to authenticated;
grant select, insert, update, delete on table public.lessons to service_role;

-- Видно так само, як розклад посади (`schedule_blocks_select_own_managed_or_admin`):
-- власник, відповідальний менеджер і адміністратор. Менеджер і так бачить
-- робочі години посади, якою опікується, — ховати від нього назву уроку сенсу
-- не має, а показувати комусь іще нема підстав.
create policy lessons_select_own_managed_or_admin
  on public.lessons for select to authenticated
  using (
    (select private.owns_position(position_id))
    or (select private.manages_position(position_id))
    or (select private.current_app_role()) = 'admin'
  );

-- Веде заняття АДМІНІСТРАТОР — як і решту розкладів.
--
-- Спершу тут стояли політики «власник посади», і це суперечило матриці прав
-- PM: рядок «Create employees, positions, schedules; assign managers and
-- deputies» у requirements/product.md віддає розклади лише адміністраторові, і
-- роль `admin` описано як ту, що «manages employees, positions, schedules…».
-- Доки PM не відповів, чи заняття взагалі є частиною розкладу, тримаємося
-- суворішого прочитання: право віддати працівникові легко, забрати — ні.
--
-- Роль беремо з profiles через хелпер, ніколи з user_metadata. Кожна операція
-- — окрема політика, як у school_closures.
create policy lessons_insert_admin
  on public.lessons for insert to authenticated
  with check ((select private.current_app_role()) = 'admin');

create policy lessons_update_admin
  on public.lessons for update to authenticated
  using ((select private.current_app_role()) = 'admin')
  with check ((select private.current_app_role()) = 'admin');

create policy lessons_delete_admin
  on public.lessons for delete to authenticated
  using ((select private.current_app_role()) = 'admin');
