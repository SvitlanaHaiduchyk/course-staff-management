import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Повідомлення сторінки після серверної дії.
 *
 * Два різні види, і це не прикраса (DESIGN.md, розділ 6): `error` — дію
 * зупинено, тому `destructive`; `note` — дія пройшла, але результату немає
 * (пропозицій не вийшло), тому звичайний `Alert`. Якщо показати обидва
 * червоним, людина вирішить, що зламалося те, що насправді просто не
 * підійшло.
 */
export function PageAlerts({ error, notes }: { error?: string; notes?: readonly (string | undefined)[] }) {
  return (
    <>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {(notes ?? []).map((note) =>
        note ? (
          <Alert key={note} role="status">
            <AlertDescription>{note}</AlertDescription>
          </Alert>
        ) : null,
      )}
    </>
  );
}
