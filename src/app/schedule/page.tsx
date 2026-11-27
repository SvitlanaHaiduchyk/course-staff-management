import { ScheduleCard } from "@/components/schedule-card";
import { getMessages } from "@/lib/i18n/server";
import { resolveMonday, weekDates } from "@/lib/leave/week";
import { loadMyLeaves } from "@/lib/supabase/my-leaves";
import { loadMyLessons } from "@/lib/supabase/my-lessons";
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

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const { week } = await searchParams;
  const { lang, m } = await getMessages();
  const { supabase, claims } = await requirePageSession();

  const myPositions = await loadMyPositions(supabase, claims.sub);
  const todayIso = new Date().toISOString().slice(0, 10);
  const mondayIso = resolveMonday(week, todayIso);
  const dates = weekDates(mondayIso);
  const positionIds = myPositions.map((p) => p.id);
  const leaves = await loadMyLeaves(supabase, positionIds, dates[0], dates[dates.length - 1]);
  // Заняття беремо на весь тиждень одразу — вони задані днем тижня, а не датою.
  const lessons = await loadMyLessons(supabase, positionIds);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{m("schedule.title")}</h1>

      <ScheduleCard
        positions={myPositions}
        leaves={leaves}
        lessons={lessons}
        mondayIso={mondayIso}
        todayIso={todayIso}
        lang={lang}
      />
    </main>
  );
}
