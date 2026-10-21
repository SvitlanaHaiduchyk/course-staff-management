import { redirect } from "next/navigation";

import { positionKindLabel, roleLabel, scheduleSummary } from "@/lib/leave/format";
import { createClient } from "@/lib/supabase/server";

import { signOut } from "./login/actions";

// Сторінка «Personal Information»: хто увійшов, на яких посадах і за яким розкладом.
// Посади показуємо першими: саме з ними працівник себе ототожнює, тоді як роль —
// це доступ до порталу (глосарій requirements/product.md: «role means portal access only»).
// Розклад тут, щоб робочі години було видно до відкриття форми заявки
// (основний сценарій requirements/01-leave-request.md, крок 2).
// Сторінка читає cookies, тому рендериться динамічно (шаблон зібрано з --no-cache-components).
export default async function Home() {
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  // RLS: користувач бачить лише власний профіль.
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", claims.sub)
    .maybeSingle();

  // RLS: працівник бачить лише власні посади та їхні розклади.
  const { data: positions } = await supabase
    .from("positions")
    .select("id, kind, job_title, divisions(name), schedule_blocks(weekday, starts_at, ends_at)")
    .eq("employee_id", claims.sub)
    .order("kind");

  const hasPositions = Boolean(positions && positions.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Personal Information</h1>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-zinc-500">Email</dt>
        <dd data-testid="user-email">{profile?.email ?? claims.email ?? "—"}</dd>

        <dt className="text-zinc-500">Ім&apos;я</dt>
        <dd data-testid="user-name">{profile?.full_name ?? "—"}</dd>

        <dt className="text-zinc-500">Посади</dt>
        <dd data-testid="positions">
          {hasPositions ? (
            <ul className="flex flex-col gap-1">
              {positions!.map((p) => (
                <li key={p.id}>
                  {p.divisions?.name ?? "—"} / {p.job_title}{" "}
                  <span className="text-zinc-500">({positionKindLabel(p.kind)})</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-zinc-500">
              посад ще немає — їх створює адміністратор (зріз WS10)
            </span>
          )}
        </dd>

        <dt className="text-zinc-500">Доступ</dt>
        <dd data-testid="user-role">{roleLabel(profile?.role)}</dd>
      </dl>

      {hasPositions ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Мій розклад</h2>
          <dl
            data-testid="schedule"
            className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm"
          >
            {positions!.map((p) => (
              <div key={p.id} className="contents">
                <dt className="text-zinc-500">{p.job_title}</dt>
                <dd>
                  {p.schedule_blocks?.length
                    ? scheduleSummary(p.schedule_blocks)
                    : "розкладу немає"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <a
        href="/requests"
        className="self-start rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
      >
        Мої заявки на відпустку
      </a>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Вийти
        </button>
      </form>
    </main>
  );
}
