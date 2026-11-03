import Link from "next/link";
import { redirect } from "next/navigation";

import { ScheduleWeek, type ScheduleLeave } from "@/components/schedule-week";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { positionKindLabel, roleLabel, scheduleSummary } from "@/lib/leave/format";
import { mondayOf, shiftWeeks, weekDates, weekRangeLabel } from "@/lib/leave/week";
import { createClient } from "@/lib/supabase/server";

import { signOut } from "./login/actions";

// Сторінка «Personal Information»: хто увійшов, на яких посадах і за яким розкладом.
// Посади показуємо першими: саме з ними працівник себе ототожнює, тоді як роль —
// це доступ до порталу (глосарій requirements/product.md: «role means portal access only»).
// Розклад тут, щоб робочі години було видно до відкриття форми заявки
// (основний сценарій requirements/01-leave-request.md, крок 2).
// Сторінка читає cookies, тому рендериться динамічно (шаблон зібрано з --no-cache-components).
/** Статуси, які прибирають людину з розкладу. Відхилений чи скасований запис її не прибирає. */
const ABSENT_STATUSES = ["awaiting", "approved", "returned"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function Home({ searchParams }: PageProps<"/">) {
  const { week } = await searchParams;
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

  // Який тиждень показуємо: з адреси, якщо вона схожа на дату, інакше поточний.
  // Невалідне значення мовчки замінюємо на сьогодні — це навігація, а не введення даних.
  const todayIso = new Date().toISOString().slice(0, 10);
  const mondayIso = mondayOf(typeof week === "string" && ISO_DATE.test(week) ? week : todayIso);
  const weekRange = weekDates(mondayIso);

  // Відпустки тижня — лише власні: фільтр за своїми посадами. Політика
  // leave_records_select_own_managed_or_admin віддала б менеджеру ще й чужі,
  // а це сторінка «Personal Information».
  const positionIds = (positions ?? []).map((p) => p.id);
  const { data: leaveRows } = positionIds.length
    ? await supabase
        .from("leave_records")
        .select("id, position_id, on_date, starts_at, ends_at, status, leave_requests(leave_type)")
        .in("position_id", positionIds)
        .in("status", ABSENT_STATUSES)
        .gte("on_date", weekRange[0])
        .lte("on_date", weekRange[6])
    : { data: [] };

  const leaves: ScheduleLeave[] = (leaveRows ?? []).map((r) => ({
    id: r.id,
    position_id: r.position_id,
    on_date: r.on_date,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    status: r.status,
    leave_type: r.leave_requests?.leave_type ?? null,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
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
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle as="h2" className="text-lg">Мій розклад</CardTitle>
              <nav aria-label="Тиждень" className="flex items-center gap-2">
                <Link
                  href={`/?week=${shiftWeeks(mondayIso, -1)}`}
                  aria-label="Попередній тиждень"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  ←
                </Link>
                <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Цей тиждень
                </Link>
                <Link
                  href={`/?week=${shiftWeeks(mondayIso, 1)}`}
                  aria-label="Наступний тиждень"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  →
                </Link>
              </nav>
            </div>
            <p data-testid="week-range" className="text-xs text-muted-foreground tabular-nums">
              {weekRangeLabel(mondayIso)}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ScheduleWeek
              positions={positions!}
              leaves={leaves}
              mondayIso={mondayIso}
              todayIso={todayIso}
            />

            {/*
              Той самий розклад рядком. Лишається з трьох причин: екранний читач
              пройде його за секунди замість сітки з абсолютних смуг, він не
              залежить від обраного тижня, і на `data-testid="schedule"` уже
              спираються перевірки.
            */}
            <dl
              data-testid="schedule"
              className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground"
            >
              {positions!.map((p) => (
                <div key={p.id} className="contents">
                  <dt>{p.job_title}</dt>
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

      <div className="flex flex-wrap gap-3">
        {/* Button базується на @base-ui/react: замість asChild — buttonVariants на посиланні. */}
        <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
          Мої заявки на відпустку
        </Link>
        <Link href="/balances" className={buttonVariants({ variant: "outline" })}>
          My balances
        </Link>
        {/*
          Посилання показуємо лише менеджеру й адміністратору — це UX, а не захист.
          Саму сторінку й дію захищають перевірка ролі в них і політики бази
          (openspec/changes/impl-leave-decision/design.md, розділ «Auth»).
        */}
        {profile?.role === "manager" || profile?.role === "admin" ? (
          <Link href="/decisions" className={buttonVariants({ variant: "outline" })}>
            Awaiting decision
          </Link>
        ) : null}
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            Вийти
          </Button>
        </form>
      </div>
    </main>
  );
}
