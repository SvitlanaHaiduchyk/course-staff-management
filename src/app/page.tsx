import Link from "next/link";

import { ProfileCard } from "@/components/profile-card";
import { ScheduleCard } from "@/components/schedule-card";
import { type ScheduleLeave } from "@/components/schedule-week";
import { Button, buttonVariants } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n/server";
import { resolveMonday, weekDates } from "@/lib/leave/week";
import { requirePageSession } from "@/lib/supabase/page-session";

import { signOut } from "./login/actions";

// Сторінка «Personal Information»: хто увійшов, на яких посадах і за яким розкладом.
// Посади показуємо першими: саме з ними працівник себе ототожнює, тоді як роль —
// це доступ до порталу (глосарій requirements/product.md: «role means portal access only»).
// Розклад тут, щоб робочі години було видно до відкриття форми заявки
// (основний сценарій requirements/01-leave-request.md, крок 2).
// Сторінка читає cookies, тому рендериться динамічно (шаблон зібрано з --no-cache-components).

/** Статуси, які прибирають людину з розкладу. Відхилений чи скасований запис її не прибирає. */
const ABSENT_STATUSES = ["awaiting", "approved", "returned"];

type PageSupabase = Awaited<ReturnType<typeof requirePageSession>>["supabase"];

/**
 * Відпустки тижня — лише власні: фільтр за своїми посадами. Політика
 * `leave_records_select_own_managed_or_admin` віддала б менеджеру ще й чужі,
 * а це сторінка «Personal Information».
 */
async function loadWeekLeaves(
  supabase: PageSupabase,
  positionIds: readonly string[],
  dates: readonly string[],
): Promise<ScheduleLeave[]> {
  if (positionIds.length === 0) return [];

  const { data } = await supabase
    .from("leave_records")
    .select("id, position_id, on_date, starts_at, ends_at, status, leave_requests(leave_type)")
    .in("position_id", [...positionIds])
    .in("status", ABSENT_STATUSES)
    .gte("on_date", dates[0])
    .lte("on_date", dates[dates.length - 1]);

  return (data ?? []).map((r) => ({
    id: r.id,
    position_id: r.position_id,
    on_date: r.on_date,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    status: r.status,
    leave_type: r.leave_requests?.leave_type ?? null,
  }));
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { week } = await searchParams;
  const { lang, m } = await getMessages();
  const { supabase, claims } = await requirePageSession();

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

  const myPositions = positions ?? [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const mondayIso = resolveMonday(week, todayIso);
  const leaves = await loadWeekLeaves(
    supabase,
    myPositions.map((p) => p.id),
    weekDates(mondayIso),
  );

  const canDecide = profile?.role === "manager" || profile?.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{m("home.title")}</h1>

      <ProfileCard
        email={profile?.email ?? claims.email}
        fullName={profile?.full_name}
        role={profile?.role}
        positions={myPositions}
        lang={lang}
      />

      {myPositions.length > 0 ? (
        <ScheduleCard
          positions={myPositions}
          leaves={leaves}
          mondayIso={mondayIso}
          todayIso={todayIso}
          lang={lang}
        />
      ) : null}

      <div className="flex flex-wrap gap-3">
        {/* Button базується на @base-ui/react: замість asChild — buttonVariants на посиланні. */}
        <Link href="/requests" className={buttonVariants({ variant: "outline" })}>
          {m("nav.requests")}
        </Link>
        <Link href="/balances" className={buttonVariants({ variant: "outline" })}>
          {m("nav.balances")}
        </Link>
        {/*
          Посилання показуємо лише менеджеру й адміністратору — це UX, а не захист.
          Саму сторінку й дію захищають перевірка ролі в них і політики бази
          (openspec/changes/impl-leave-decision/design.md, розділ «Auth»).
        */}
        {canDecide ? (
          <Link href="/decisions" className={buttonVariants({ variant: "outline" })}>
            {m("decisions.awaiting")}
          </Link>
        ) : null}
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            {m("nav.signOut")}
          </Button>
        </form>
      </div>
    </main>
  );
}
