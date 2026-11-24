import { ScheduleCard } from "@/components/schedule-card";
import { type ScheduleLeave } from "@/components/schedule-week";
import { getMessages } from "@/lib/i18n/server";
import { resolveMonday, weekDates } from "@/lib/leave/week";
import { loadMyPositions } from "@/lib/supabase/my-positions";
import { requirePageSession } from "@/lib/supabase/page-session";

// Сторінка «Мій розклад»: тижнева сітка робочих годин із відпустками поверх них.
//
// Раніше вона жила карткою на «Personal Information» (`/`). Окремою сторінкою —
// бо це інше питання: на головній людина дивиться, ХТО вона в порталі (посади,
// доступ), а тут — КОЛИ вона працює, і до цього повертаються частіше, ніж до
// власних посад. Заодно головна перестала робити два запити заради картки, яку
// там не завжди відкривають.
//
// Сторінка читає cookies, тому рендериться динамічно.

/** Статуси, які прибирають людину з розкладу. Відхилений чи скасований запис її не прибирає. */
const ABSENT_STATUSES = ["awaiting", "approved", "returned"];

type PageSupabase = Awaited<ReturnType<typeof requirePageSession>>["supabase"];

/**
 * Відпустки тижня — лише власні: фільтр за своїми посадами. Політика
 * `leave_records_select_own_managed_or_admin` віддала б менеджеру ще й чужі,
 * а це сторінка про себе.
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

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const { week } = await searchParams;
  const { lang, m } = await getMessages();
  const { supabase, claims } = await requirePageSession();

  const myPositions = await loadMyPositions(supabase, claims.sub);
  const todayIso = new Date().toISOString().slice(0, 10);
  const mondayIso = resolveMonday(week, todayIso);
  const leaves = await loadWeekLeaves(
    supabase,
    myPositions.map((p) => p.id),
    weekDates(mondayIso),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{m("schedule.title")}</h1>

      <ScheduleCard
        positions={myPositions}
        leaves={leaves}
        mondayIso={mondayIso}
        todayIso={todayIso}
        lang={lang}
      />
    </main>
  );
}
