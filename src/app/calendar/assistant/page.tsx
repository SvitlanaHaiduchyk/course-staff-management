import Link from "next/link";
import { cookies } from "next/headers";

import { removeSuggestion, saveSuggestions, suggestClosures } from "./actions";
import { AssistantTextForm } from "@/components/assistant-text-form";
import { PageAlerts } from "@/components/page-alerts";
import { SuggestionList } from "@/components/suggestion-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessages } from "@/lib/i18n/server";
import { ONLY_ADMIN } from "@/lib/leave/calendar";
import { ASSISTANT_COOKIE, decodeSuggestions } from "@/lib/leave/suggestions";
import { requireAdminPage } from "@/lib/supabase/page-session";

/**
 * Помічник шкільного календаря: вставлений текст → запропоновані закриття.
 *
 * Вимоги: `requirements/05-calendar-assistant.md` (знімок 2026-11-18);
 * план: `openspec/changes/impl-calendar-assistant/design.md`.
 *
 * ОКРЕМА сторінка, а не блок на `/calendar/manage`: ручне додавання має
 * лишитися простим і працювати без JavaScript, а помічник — довга операція з
 * очікуванням. В одній формі невдалий запит до моделі забирав би з собою й те,
 * що адміністратор уже набрав руками (`AC-ASSIST-09`).
 *
 * Перевірка ролі тут і в кожній дії. Сторінка — публічний GET, тож перевірка в
 * ній обов'язкова (`AC-ASSIST-11`); дії перевіряють ще раз, бо їх можна
 * викликати повз сторінку.
 */
export default async function CalendarAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; note?: string; saved?: string }>;
}) {
  const { isAdmin } = await requireAdminPage();
  const { m } = await getMessages();
  const { error, note, saved } = await searchParams;

  if (!isAdmin) {
    // Відмова на сторінці: жодної пропозиції тут не показано й не збережено.
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold">{m("assistant.title")}</h1>
        <Alert variant="destructive">
          <AlertDescription>{ONLY_ADMIN}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const closures = decodeSuggestions((await cookies()).get(ASSISTANT_COOKIE)?.value);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{m("assistant.title")}</h1>
      <p className="text-sm text-muted-foreground">{m("assistant.intro")}</p>

      <PageAlerts error={error} notes={[note, saved ? `${m("assistant.saved")} ${saved}` : undefined]} />

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-lg font-medium">
            {m("assistant.paste")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AssistantTextForm action={suggestClosures} m={m} />
        </CardContent>
      </Card>

      {closures.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-lg font-medium">
              {m("assistant.suggestions")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">{m("assistant.notSavedYet")}</p>
            <SuggestionList closures={closures} saveAction={saveSuggestions} removeAction={removeSuggestion} m={m} />
          </CardContent>
        </Card>
      ) : null}

      {/* AC-ASSIST-09: ручне додавання закриття має лишатися під рукою. */}
      <div className="flex flex-wrap gap-3">
        <Link href="/calendar/manage" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {m("calendar.manage")}
        </Link>
        <Link href="/calendar" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {m("calendar.title")}
        </Link>
      </div>
    </main>
  );
}
