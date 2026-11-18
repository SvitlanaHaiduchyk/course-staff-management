import { redirect } from "next/navigation";

import { addClosure, removeClosure } from "./actions";
import { ClosureAdminList } from "@/components/closure-admin-list";
import { ClosureForm } from "@/components/closure-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { INTL_LOCALE } from "@/lib/i18n/dict";
import { getMessages } from "@/lib/i18n/server";
import { type ClosureRow } from "@/lib/leave/calendar";
import { createClient } from "@/lib/supabase/server";

/** AC-CAL-12: дослівний текст PM, англійською в обох мовах інтерфейсу. */
const ONLY_ADMIN = "Only an administrator can change the school calendar";

/**
 * Зміна шкільного календаря — лише для адміністратора.
 *
 * ОКРЕМА сторінка, а не форма на `/calendar`: `AC-CAL-12` вимагає, щоб
 * працівник, який відкрив її **за прямим посиланням**, побачив повідомлення.
 * Сховати форму замало — сторінка має існувати й відмовляти.
 *
 * Перевірка ролі тут і в базі. Ця сторінка — публічний GET, тож перевірка в
 * ній обов'язкова (`AC-CAL-12`); політики `insert` і `delete` ловлять спробу
 * повз сторінку (`AC-CAL-13`). Два рубежі, і прибрати можна лише обидва.
 */
export default async function ManageCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { lang, m } = await getMessages();
  const { error } = await searchParams;

  // Роль — із profiles, ніколи з user_metadata.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profile?.role !== "admin") {
    // Відмова на сторінці: жодного закриття тут не показано й не додано.
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold">{m("calendar.manage")}</h1>
        <Alert variant="destructive">
          <AlertDescription>{ONLY_ADMIN}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("school_closures")
    .select("id, name, starts_on, ends_on, closes_at")
    .order("starts_on");

  const closures = (rows ?? []) as ClosureRow[];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{m("calendar.manage")}</h1>

      {error ? (
        // Дію зупинено — отже destructive, а не default (DESIGN.md, розділ 6).
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg font-medium">
            {m("calendar.add")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ClosureForm action={addClosure} m={m} locale={INTL_LOCALE[lang]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg font-medium">
            {m("calendar.existing")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ClosureAdminList closures={closures} action={removeClosure} m={m} />
        </CardContent>
      </Card>
    </main>
  );
}
