import { minutesBetween, substituteLabel, upgradeMark } from "@/lib/leave/substitutes";

/**
 * Заміна на записі: адреса або «No substitute», а під нею — позначка
 * підвищення, якщо асистент підміняє вчителя.
 *
 * Окремим компонентом, а не рядками всередині таблиці: той самий блок
 * потрібен і в «My requests», і в списку менеджера, а `RequestsPage` і без
 * нього найскладніша функція застосунку (`fallow`).
 *
 * `AC-SUBST-02`, `AC-SUBST-03`, `AC-SUBST-08`, `AC-SUBST-09`.
 */
export function RecordSubstitute({
  email,
  absentJobTitle,
  substituteJobTitle,
  startsAt,
  endsAt,
}: {
  email: string | null | undefined;
  absentJobTitle: string | null | undefined;
  substituteJobTitle: string | null | undefined;
  startsAt: string;
  endsAt: string;
}) {
  const mark = upgradeMark({
    absentJobTitle,
    substituteJobTitle,
    minutes: minutesBetween(startsAt, endsAt),
  });

  return (
    <>
      <div data-testid="substitute" className="text-xs text-muted-foreground">
        {substituteLabel(email)}
      </div>
      {/* Позначка підвищення — завжди текстом; колір тут нічого не означає. */}
      {mark ? (
        <div data-testid="upgrade" className="text-xs tabular-nums">
          {mark}
        </div>
      ) : null}
    </>
  );
}
