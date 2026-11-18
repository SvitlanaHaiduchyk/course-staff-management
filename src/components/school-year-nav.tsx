import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { schoolYearLabel } from "@/lib/leave/calendar";

/**
 * Перемикач навчальних років календаря.
 *
 * Звичайні посилання, а не кнопки з JavaScript: рік живе в адресі, тож
 * сторінку можна відкрити одразу на потрібному році, поділитися посиланням і
 * користуватися кнопкою «назад» браузера.
 */
export function SchoolYearNav({ year, label }: { year: number; label: string }) {
  return (
    <nav className="flex items-center gap-2" aria-label={label}>
      {[year - 1, year + 1].map((y) => (
        <Link
          key={y}
          href={`/calendar?year=${y}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {schoolYearLabel(y)}
        </Link>
      ))}
    </nav>
  );
}
