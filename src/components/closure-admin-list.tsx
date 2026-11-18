import { Button } from "@/components/ui/button";
import type { MessageKey } from "@/lib/i18n/dict";
import { closureDatesLabel, type ClosureRow } from "@/lib/leave/calendar";

/**
 * Наявні закриття з кнопкою «Прибрати» — для сторінки адміністратора.
 *
 * Окремо від `ClosureList`, хоч рядок і схожий: там перелік для читання всіма,
 * тут — дія, і форма прибирання в спільному компоненті зробила б його
 * залежним від ролі. Одне правило з'єднувати не варто ціною двох режимів.
 */
export function ClosureAdminList({
  closures,
  action,
  m,
}: {
  closures: readonly ClosureRow[];
  action: (formData: FormData) => void | Promise<void>;
  m: (key: MessageKey) => string;
}) {
  if (closures.length === 0) {
    return <p className="text-sm text-muted-foreground">{m("calendar.none")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {closures.map((c) => (
        <li
          key={c.id}
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border pb-2 last:border-b-0"
        >
          <span className="text-sm">{c.name}</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {closureDatesLabel(c, m("calendar.from"))}
          </span>
          <form action={action}>
            <input type="hidden" name="id" value={c.id} />
            <Button type="submit" variant="outline" size="sm">
              {m("calendar.remove")}
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
