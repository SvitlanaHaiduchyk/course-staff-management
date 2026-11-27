/**
 * Заміни — чиста логіка й тексти PM.
 *
 * Вимоги: requirements/06-substitutes.md (знімок 2026-11-27),
 * специфікація: openspec/specs/substitutes/spec.md.
 *
 * Межі «хто веде список» і «чи вільна заміна» тримає база (політики на
 * `public.substitutes` і `private.substitute_busy_at`). Тут — те, що видно
 * людині: підписи, порожні стани й позначка підвищення.
 */

/** `AC-SUBST-03`: запис без заміни. */
export const NO_SUBSTITUTE = "No substitute";

/** `AC-SUBST-11`: список замін працівника порожній. */
export const NO_SUBSTITUTES_YET = "Your manager has not added substitutes for you yet";

/** `AC-SUBST-12`: список замін змінює лише менеджер посади чи адміністратор. */
export const ONLY_MANAGER_CHANGES_LIST =
  "Only the manager of this employee's position can change the substitute list";

/** `AC-SUBST-15`: людина нікого не підміняє. */
export const NOT_COVERING_ANYONE = "You are not covering for anyone";

/** Статуси, у яких підміна справді стоїть у розкладі людини (`AC-SUBST-15`). */
export const COVERING_STATUSES = ["awaiting", "returned", "approved"] as const;

/**
 * Чи є ця посада вчительською / асистентською — за назвою, без урахування
 * регістру.
 *
 * Правило PM дослівно: позначку дає посада, назва якої **містить** «Teacher»
 * (його приклад — «Math teacher»), і заміна, основна посада якої має назву
 * «Assistant». Тому саме `includes`, а не рівність: «Math teacher» лишається
 * вчительською посадою.
 */
export function isTeacherTitle(jobTitle: string | null | undefined): boolean {
  return (jobTitle ?? "").toLowerCase().includes("teacher");
}

export function isAssistantTitle(jobTitle: string | null | undefined): boolean {
  return (jobTitle ?? "").toLowerCase().includes("assistant");
}

/**
 * `AC-SUBST-08`, `AC-SUBST-09`: позначка «With upgrade» з хвилинами — або
 * `null`, якщо підвищення немає.
 *
 * Хвилини — тривалість запису (припущення PM: «the minutes of the record
 * inside the schedule, the same as its duration»).
 */
export function upgradeMark(input: {
  readonly absentJobTitle: string | null | undefined;
  readonly substituteJobTitle: string | null | undefined;
  readonly minutes: number;
}): string | null {
  if (!isTeacherTitle(input.absentJobTitle)) return null;
  if (!isAssistantTitle(input.substituteJobTitle)) return null;
  if (input.minutes <= 0) return null;
  return `With upgrade: ${input.minutes} min`;
}

/** Хвилини між «08:30» і «12:00» — 210. Час у форматі `HH:MM` або `HH:MM:SS`. */
export function minutesBetween(startsAt: string, endsAt: string): number {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  return Math.max(toMinutes(endsAt) - toMinutes(startsAt), 0);
}

/**
 * `AC-SUBST-11`: що показати замість вибору, коли список замін порожній, —
 * або `null`, коли є з кого вибирати. Заявку це не зупиняє: вибору просто
 * немає, і запис створюється з «No substitute».
 */
export function emptyListHint(substituteCount: number): string | null {
  return substituteCount === 0 ? NO_SUBSTITUTES_YET : null;
}

/** Підпис заміни на записі: адреса або «No substitute» (`AC-SUBST-03`). */
export function substituteLabel(email: string | null | undefined): string {
  return email && email.trim() !== "" ? email : NO_SUBSTITUTE;
}
