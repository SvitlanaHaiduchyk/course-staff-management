import { redirect } from "next/navigation";

import { PageAlerts } from "@/components/page-alerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getMessages } from "@/lib/i18n/server";
import { ONLY_MANAGER_CHANGES_LIST } from "@/lib/leave/substitutes";
import { createClient } from "@/lib/supabase/server";

import { addSubstitute, removeSubstitute } from "./actions";

/**
 * Список можливих замін кожного працівника — сторінка менеджера (AC-SUBST-01).
 *
 * Список належить працівникові, а не посаді (припущення PM), тож рядок тут —
 * це працівник, а не його посада. Хто може міняти список, вирішує база:
 * сторінка лише не малює форм тому, кому вони все одно не спрацюють
 * (AC-SUBST-12, AC-SUBST-13).
 */
export default async function SubstitutesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const { m } = await getMessages();
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  const role = profile?.role;
  if (role !== "manager" && role !== "admin") {
    // Відмова на сторінці: жодного чужого списку тут не показано (AC-SUBST-12).
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold">{m("substitutes.title")}</h1>
        <PageAlerts error={ONLY_MANAGER_CHANGES_LIST} />
      </main>
    );
  }

  // RLS: менеджер бачить посади своїх працівників, адміністратор — усі.
  const { data: positions } = await supabase
    .from("positions")
    .select("employee_id, job_title, profiles!positions_employee_id_fkey(email, full_name)")
    .order("job_title");

  const employees = new Map<string, { email: string; jobTitle: string }>();
  for (const p of positions ?? []) {
    const email = p.profiles?.email ?? "";
    if (email && !employees.has(p.employee_id)) {
      employees.set(p.employee_id, { email, jobTitle: p.job_title });
    }
  }

  const { data: rows } = await supabase
    .from("substitutes")
    .select("employee_id, substitute_id");

  const emailById = new Map<string, string>(
    [...employees].map(([id, info]) => [id, info.email]),
  );

  const listByEmployee = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const list = listByEmployee.get(row.employee_id) ?? [];
    list.push(row.substitute_id);
    listByEmployee.set(row.employee_id, list);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{m("substitutes.title")}</h1>

      <PageAlerts error={params.error} notes={[params.notice]} />

      {[...employees].map(([employeeId, info]) => {
        const current = listByEmployee.get(employeeId) ?? [];
        const candidates = [...employees].filter(
          ([id]) => id !== employeeId && !current.includes(id),
        );

        return (
          <Card key={employeeId}>
            <CardHeader>
              <CardTitle as="h2" className="text-lg font-medium">
                {info.email}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">{info.jobTitle}</p>

              {current.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m("substitutes.empty")}</p>
              ) : (
                <ul data-testid={`list-${info.email}`} className="flex flex-col gap-1 text-sm">
                  {current.map((substituteId) => (
                    <li key={substituteId} className="flex items-center gap-2">
                      <span>{emailById.get(substituteId) ?? substituteId}</span>
                      <form action={removeSubstitute}>
                        <input type="hidden" name="employeeId" value={employeeId} />
                        <input type="hidden" name="substituteId" value={substituteId} />
                        <Button type="submit" variant="ghost" size="sm">
                          {m("substitutes.remove")}
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              {candidates.length > 0 ? (
                <form action={addSubstitute} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`add-${employeeId}`} className="text-xs">
                      {m("substitutes.add")}
                    </Label>
                    {/*
                      Нативний select: форма серверна й має працювати без
                      JavaScript — та сама причина, що й у формі заявки.
                    */}
                    <select
                      id={`add-${employeeId}`}
                      name="substituteId"
                      required
                      className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                    >
                      {candidates.map(([id, candidate]) => (
                        <option key={id} value={id}>
                          {candidate.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" variant="outline" size="sm">
                    {m("substitutes.addButton")}
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </main>
  );
}
