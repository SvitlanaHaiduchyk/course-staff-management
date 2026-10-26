import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    .order("kind", { ascending: false }); // main перед additional

  const hasPositions = Boolean(positions && positions.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Personal Information</h1>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd data-testid="user-email">{profile?.email ?? claims.email ?? "—"}</dd>

            <dt className="text-muted-foreground">Ім&apos;я</dt>
            <dd data-testid="user-name">{profile?.full_name ?? "—"}</dd>

            {/*
              Рядок посад показуємо лише тим, у кого вони є. За глосарієм product.md
              працівник — це «a person who works at the school and has at least one position»,
              тож порожній список буває хіба в адміністратора без посади.
            */}
            {hasPositions ? (
              <>
                <dt className="text-muted-foreground">Посади</dt>
                <dd data-testid="positions">
                  <ul className="flex flex-col gap-1">
                    {positions!.map((p) => (
                      <li key={p.id}>
                        {p.divisions?.name ?? "—"} / {p.job_title}{" "}
                        <span className="text-muted-foreground">
                          ({positionKindLabel(p.kind)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : null}

            <dt className="text-muted-foreground">Доступ</dt>
            <dd data-testid="user-role">{roleLabel(profile?.role)}</dd>
          </dl>
        </CardContent>
      </Card>

      {hasPositions ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-lg">Мій розклад</CardTitle>
          </CardHeader>
          <CardContent>
            <dl
              data-testid="schedule"
              className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm"
            >
              {positions!.map((p) => (
                <div key={p.id} className="contents">
                  <dt className="text-muted-foreground">{p.job_title}</dt>
                  <dd className="tabular-nums">
                    {p.schedule_blocks?.length
                      ? scheduleSummary(p.schedule_blocks)
                      : "розкладу немає"}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex gap-3">
        {/* Button базується на @base-ui/react: замість asChild — buttonVariants на посиланні. */}
        <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
          Мої заявки на відпустку
        </Link>
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            Вийти
          </Button>
        </form>
      </div>
    </main>
  );
}
