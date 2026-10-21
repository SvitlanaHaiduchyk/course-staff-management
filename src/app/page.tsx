import { redirect } from "next/navigation";

import { scheduleSummary } from "@/lib/leave/format";
import { createClient } from "@/lib/supabase/server";

import { signOut } from "./login/actions";

// Сторінка «Personal Information»: хто увійшов, з якою роллю і за яким розкладом.
// Розклад показуємо й тут, щоб працівник бачив свої робочі години до того, як
// відкриє форму заявки (основний сценарій requirements/01-leave-request.md, крок 2).
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Personal Information</h1>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-500">Email</dt>
        <dd data-testid="user-email">{profile?.email ?? claims.email ?? "—"}</dd>
        <dt className="text-zinc-500">Ім&apos;я</dt>
        <dd data-testid="user-name">{profile?.full_name ?? "—"}</dd>
        <dt className="text-zinc-500">Роль</dt>
        <dd data-testid="user-role">{profile?.role ?? "профіль не знайдено"}</dd>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Мій розклад</h2>
        {positions && positions.length > 0 ? (
          <ul data-testid="positions" className="flex flex-col gap-3 text-sm">
            {positions.map((p) => (
              <li key={p.id} className="flex flex-col">
                <span>
                  {p.divisions?.name ?? "—"} / {p.job_title}{" "}
                  <span className="text-zinc-500">
                    ({p.kind === "main" ? "основна" : "додаткова"})
                  </span>
                </span>
                <span className="text-xs text-zinc-500">
                  {p.schedule_blocks?.length
                    ? scheduleSummary(p.schedule_blocks)
                    : "розкладу немає"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p data-testid="positions-empty" className="text-sm text-zinc-500">
            У вас ще немає посад з розкладом. Їх створює адміністратор (зріз WS10).
          </p>
        )}
      </section>

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
