// Мутанти для scripts/mutation-check.mjs (npm run mutation:sql). Мутант = одне правило з AC, навмисно зламане.
// Формат узято з materials/testing/scripts/mutants.mjs домашки WS8.
//
// Поля:
//   id, kind ("sql" | "ts"), ac (який AC це правило доводить), what (що зламано — людською мовою);
//   file — що мутуємо; tests — файли тестів, які мають довести правило (саме їх і запускаємо);
//   find — рядок або RegExp, що трапляється у файлі РІВНО один раз (надійніше за номери рядків, які зсуваються);
//   replace — заміна (вставляється буквально: «$$» у plpgsql лишається «$$»);
//   expect: "survive" + reason — лише для еквівалентного мутанта.
//
// Stryker мутує лише TypeScript. Правила наших відмовних AC живуть у політиках RLS, колонкових grant і функціях
// Postgres, і єдиний спосіб їх перевірити — підняти справжню базу (PGlite) і зламати правило. Саме це тут і робимо.

const SCHEMA = "supabase/migrations/20261020203434_leave_schema.sql";
const DECISIONS = "supabase/migrations/20261026201058_leave_decisions.sql";
const BALANCE = "supabase/migrations/20261102200744_leave_balance.sql";
const PROFILES = "supabase/migrations/20261012000000_profiles_and_roles.sql";

const DECISIONS_DB = "tests/db/decisions.test.ts";
const BALANCE_DB = "tests/db/balance-access.test.ts";
const RLS_DB = "tests/db/rls.test.ts";

export const mutants = [
  // ── Три AC, які доводимо наскрізь у WS8 ─────────────────────────────────────────────────────────────────────
  {
    id: "D1",
    kind: "sql",
    ac: "AC-DECIDE-01",
    file: SCHEMA,
    tests: [DECISIONS_DB, RLS_DB],
    what: "політика select: менеджер бачить записи БУДЬ-ЯКОЇ посади, а не лише своїх",
    find:
      "    (select private.owns_record(request_id))\n" +
      "    or (select private.manages_position(position_id))\n" +
      "    or (select private.current_app_role()) = 'admin'",
    replace: "    true",
  },
  {
    id: "D2",
    kind: "sql",
    ac: "AC-DECIDE-04",
    file: DECISIONS,
    tests: [DECISIONS_DB],
    what: "обмеження таблиці: повернення на доопрацювання приймається без коментаря",
    find: "    check (decision <> 'returned' or (comment is not null and btrim(comment) <> ''))",
    replace: "    check (true)",
  },
  {
    id: "B1",
    kind: "sql",
    ac: "AC-BALANCE-13",
    file: BALANCE,
    tests: [BALANCE_DB],
    what: "перевірка права на залишки: чужі залишки бачить будь-хто з входом",
    find:
      "  select p_employee_id = (select auth.uid())\n" +
      "      or (select private.manages_employee(p_employee_id))\n" +
      "      or (select private.current_app_role()) = 'admin';",
    replace: "  select true;",
  },

  // ── Правила суміжних AC: їх ламали руками в PR #25, #27 і #33; тут вони закріплені ────────────────────────────
  // Правило private.decides_record (AC-DECIDE-09, AC-DECIDE-18) окремим мутантом не беремо:
  // у файлі два схожі заголовки функцій, і заміна тіла цілим блоком тут ненадійна. Те саме
  // правило тримає B2 на private.manages_employee, а ручні прогони є в описах PR #25 і #28.
  {
    id: "B2",
    kind: "sql",
    ac: "AC-BALANCE-20",
    file: BALANCE,
    tests: [BALANCE_DB],
    what: "область менеджера: він вважається відповідальним за будь-якого працівника",
    find:
      "    from public.positions as pos\n" +
      "    join public.position_managers as pm on pm.position_id = pos.id\n" +
      "    where pos.employee_id = p_employee_id\n" +
      "      and pm.manager_id = (select auth.uid())",
    replace:
      "    from public.positions as pos\n" +
      "    where pos.employee_id = p_employee_id",
  },
  {
    id: "P1",
    kind: "sql",
    ac: "самопідвищення ролі",
    file: PROFILES,
    tests: [RLS_DB],
    what: "колонковий grant: користувач може змінити собі role",
    find: "grant update (full_name) on table public.profiles to authenticated;",
    replace: "grant update (full_name, role) on table public.profiles to authenticated;",
  },
];
