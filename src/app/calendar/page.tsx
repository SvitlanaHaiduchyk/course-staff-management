import { redirect } from "next/navigation";

import Link from "next/link";

import { CalendarYearGrid } from "@/components/calendar-year-grid";
import { ClosureList } from "@/components/closure-list";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { SchoolYearNav } from "@/components/school-year-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { INTL_LOCALE } from "@/lib/i18n/dict";
import { getMessages } from "@/lib/i18n/server";
import {
  closuresOfSchoolYear,
  parseSchoolYear,
  schoolYearLabel,
  schoolYearRange,
} from "@/lib/leave/calendar";
import { schoolYearOf } from "@/lib/leave/balance";
import { createClient } from "@/lib/supabase/server";

/**
 * Шкільний календар — requirements/04-school-calendar.md, основний сценарій.
 *
 * Бачить кожен авторизований (`AC-CAL-02`); неавторизований потрапляє на
 * сторінку входу й не бачить жодної назви чи дати (`AC-CAL-14`). Другий рубіж
 * — RLS: `anon` не має grant на таблицю взагалі, тож навіть прямий запит
 * нічого не віддасть.
 *
 * Сторінка читає cookies, тож рендериться динамічно.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { lang, m } = await getMessages();

  const { year: yearParam } = await searchParams;
  const year = parseSchoolYear(yearParam, schoolYearOf(new Date().toISOString().slice(0, 10)));

  const { from, to } = schoolYearRange(year);

  // Роль — із profiles, ніколи з user_metadata. Потрібна лише для того, чи
  // показувати кнопку зміни календаря; доступ тримають політики.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  // Рік фільтруємо в базі, а не в пам'яті: закриттів за всі роки може бути
  // багато, а сторінці потрібен лише один рік.
  const { data: rows } = await supabase
    .from("school_closures")
    .select("id, name, starts_on, ends_on, closes_at")
    .lte("starts_on", to)
    .gte("ends_on", from)
    .order("starts_on");

  // Той самий порядок і ту саму межу року перевіряє юніт-тест — тут лише показ.
  const closures = closuresOfSchoolYear(rows ?? [], year);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{m("calendar.title")}</h1>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h2" className="text-lg font-medium">
            {m("calendar.schoolYear")} {schoolYearLabel(year)}
          </CardTitle>

          <SchoolYearNav year={year} label={m("calendar.yearNav")} />
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {/* Сітка — «коли зачинено», перелік під нею — «що саме й на які дати». */}
          <CalendarYearGrid closures={closures} year={year} locale={INTL_LOCALE[lang]} m={m} />

          <ClosureList closures={closures} year={year} fromLabel={m("calendar.from")} />

          {/*
            Посилання на зміну календаря — лише адміністраторові й лише тут:
            у шапці його немає (план зрізу, розділ «Навігація»). Працівник
            бачить сторінку календаря без жодного натяку на кнопку, а якщо
            відкриє /calendar/manage за прямим посиланням — отримає відмову
            (AC-CAL-12).
          */}
          {isAdmin ? (
            <Link
              href="/calendar/manage"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
            >
              {m("calendar.manage")}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
