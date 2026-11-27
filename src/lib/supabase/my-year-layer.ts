import "server-only";

// Особистий шар шкільного календаря одним викликом: робочі дні тижня та власні
// відпустки за навчальний рік. Окремим модулем, щоб `CalendarPage` лишалася
// сторінкою — читає дані й складає блоки, а не знає, з чого шар зроблено
// (її складність стереже `fallow`).

import {
  leavesByDate,
  type LeaveMark,
  type TimedPosition,
} from "@/lib/leave/calendar-overlay";
import type { LessonRow } from "@/lib/leave/lessons";
import { loadMyLeaves } from "@/lib/supabase/my-leaves";
import { loadMyLessons } from "@/lib/supabase/my-lessons";
import { loadMyPositions } from "@/lib/supabase/my-positions";
import type { requirePageSession } from "@/lib/supabase/page-session";

type PageSupabase = Awaited<ReturnType<typeof requirePageSession>>["supabase"];

export type MyYearLayer = {
  /**
   * Власні посади з розкладом. Сітка робить із них і робочі дні тижня, і
   * години конкретного дня у віконечку — звідси посади, а не готовий набір
   * днів: із набору днів годин уже не дістати.
   */
  readonly positions: readonly TimedPosition[];
  /** Власні відпустки за датами; на одну дату може бути кілька — по посаді. */
  readonly leaves: ReadonlyMap<string, readonly LeaveMark[]>;
  /** Власні заняття тижня; день із них вибирає `lessonsOn` (ADR 0004). */
  readonly lessons: readonly LessonRow[];
};

/**
 * Шар для сітки року. RLS віддає лише власні посади й записи, тож сторінку
 * бачить кожен авторизований, але шар у кожного свій.
 */
export async function loadMyYearLayer(
  supabase: PageSupabase,
  employeeId: string,
  from: string,
  to: string,
): Promise<MyYearLayer> {
  const positions = await loadMyPositions(supabase, employeeId);
  const positionIds = positions.map((p) => p.id);
  const leaves = await loadMyLeaves(supabase, positionIds, from, to);
  const lessons = await loadMyLessons(supabase, positionIds);

  return { positions, leaves: leavesByDate(leaves), lessons };
}
