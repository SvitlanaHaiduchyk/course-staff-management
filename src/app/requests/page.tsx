import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { submitLeaveRequest } from "./actions";

/** Типи відпустки з глосарію `requirements/product.md`. */
const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick leave",
  personal: "Personal leave",
  unpaid: "Unpaid leave",
  family_celebration: "Family celebration",
};

/** П'ять статусів запису — перелік остаточний (припущення PM). */
const STATUS_LABELS: Record<string, string> = {
  awaiting: "Awaiting decision",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned for revision",
  cancelled: "Cancelled",
};

const hhmm = (time: string) => time.slice(0, 5);

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    redirect("/login");
  }

  // RLS: працівник бачить лише власні посади (AC-LEAVE-02, AC-LEAVE-03).
  const { data: positions } = await supabase
    .from("positions")
    .select("id, kind, job_title, divisions(name)")
    .eq("employee_id", claims.sub)
    .order("kind");

  // AC-LEAVE-14: лише власні записи. Фільтра за працівником тут немає свідомо —
  // чужі записи відсікає політика leave_records_select_own_managed_or_admin.
  const { data: records } = await supabase
    .from("leave_records")
    .select(
      "id, on_date, starts_at, ends_at, status, positions(job_title), leave_requests(leave_type, comment)",
    )
    .order("on_date", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <h1 className="text-2xl font-semibold">My requests</h1>

      {error ? (
        <p role="alert" data-testid="request-error" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" data-testid="request-notice" className="text-sm text-amber-700">
          {notice}
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Нова заявка</h2>
        {positions && positions.length > 0 ? (
          <form action={submitLeaveRequest} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 font-medium">Посади</legend>
              {positions.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input type="checkbox" name="position" value={p.id} defaultChecked />
                  {p.divisions?.name ?? "—"} / {p.job_title}
                  <span className="text-zinc-500">
                    ({p.kind === "main" ? "основна" : "додаткова"})
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1 text-sm">
              Дата (цілий день)
              <input
                name="date"
                type="date"
                required
                className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Ще дата (не обов&apos;язково)
              <input
                name="date"
                type="date"
                className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Тип відпустки
              <select
                name="leaveType"
                required
                defaultValue="sick"
                className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Ступінь спорідненості (лише для Family celebration)
              <input
                name="relationship"
                className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Коментар (до 500 символів)
              <textarea
                name="comment"
                maxLength={500}
                rows={2}
                className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <button
              type="submit"
              className="self-start rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              Подати заявку
            </button>
          </form>
        ) : (
          <p className="text-sm text-zinc-500">
            У вас ще немає посад з розкладом. Їх створює адміністратор (зріз WS10).
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Мої записи</h2>
        {records && records.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300 dark:border-zinc-700">
                <th className="py-2">Дата</th>
                <th>Години</th>
                <th>Посада</th>
                <th>Тип</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody data-testid="records">
              {records.map((r) => (
                <tr key={r.id} className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="py-2">{r.on_date}</td>
                  <td>
                    {hhmm(r.starts_at)}–{hhmm(r.ends_at)}
                  </td>
                  <td>{r.positions?.job_title ?? "—"}</td>
                  <td>
                    {LEAVE_TYPE_LABELS[r.leave_requests?.leave_type ?? ""] ?? "—"}
                  </td>
                  <td>{STATUS_LABELS[r.status] ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p data-testid="records-empty" className="text-sm text-zinc-500">
            Записів ще немає.
          </p>
        )}
      </section>
    </main>
  );
}
