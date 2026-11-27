import { addLesson, removeLesson } from "./actions";
import { LessonForm } from "@/components/lesson-form";
import { LessonList } from "@/components/lesson-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DICT, weekdayNames, type MessageKey } from "@/lib/i18n/dict";
import { getMessages } from "@/lib/i18n/server";
import { positionLabel, positionLabels } from "@/lib/leave/lessons";
import { loadMyLessons } from "@/lib/supabase/my-lessons";
import { loadMyPositions } from "@/lib/supabase/my-positions";
import { requirePageSession } from "@/lib/supabase/page-session";

/**
 * «Мої заняття» — уроки й наради всередині робочих годин.
 *
 * Вимог PM на це немає; рішення, межі й розглянуті варіанти —
 * `docs/decisions/0004-lessons-as-a-layer.md`, питання до PM —
 * `docs/spec-reading.md` (2026-11-27).
 *
 * Окрема сторінка, а не форма на `/schedule`: там людина ЧИТАЄ свій тиждень, і
 * форма введення поряд із сіткою перетворила б погляд на розклад на роботу з
 * даними. Заняття ж вводять рідко — здебільшого раз на півріччя.
 *
 * Вступний рядок на сторінці каже прямо, що робочих годин заняття не змінюють:
 * два поняття часу поруч інакше зіллються в одне, і людина вирішить, що урок
 * впливає на залишок відпустки.
 *
 * Сторінка читає cookies, тому рендериться динамічно.
 */
export default async function LessonsPage({ searchParams }: PageProps<"/lessons">) {
  const { lang, m } = await getMessages();
  const { supabase, claims } = await requirePageSession();
  const { error } = await searchParams;

  const positions = await loadMyPositions(supabase, claims.sub);
  const lessons = await loadMyLessons(
    supabase,
    positions.map((p) => p.id),
  );

  const dayNames = weekdayNames(lang);
  const positionTitles = positionLabels(positions);
  // У виборі посади — той самий підпис, що й на смузі заняття.
  const choices = positions.map((p) => ({ id: p.id, job_title: positionLabel(p) }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">{m("lessons.title")}</h1>
      <p className="text-sm text-muted-foreground">{m("lessons.intro")}</p>

      {/*
        Дію зупинено — отже `destructive`, а не `default` (DESIGN.md, розділ 6).
        Показуємо лише СВОЇ ключі словника: у рядку адреси може опинитися
        будь-що, і виводити його як текст повідомлення не можна.
      */}
      {isLessonMessageKey(error) ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{m(error)}</AlertDescription>
        </Alert>
      ) : null}

      {positions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m("lessons.noPositions")}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="text-lg font-medium">
                {m("lessons.add")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LessonForm
                action={addLesson}
                positions={choices}
                dayNames={dayNames}
                m={m}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="text-lg font-medium">
                {m("lessons.existing")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LessonList
                lessons={lessons}
                positionTitles={positionTitles}
                dayNames={dayNames}
                action={removeLesson}
                m={m}
              />
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

/**
 * Чи це ключ повідомлення цієї сторінки.
 *
 * Дія повертає саме КЛЮЧ, а не текст (`parseLessonInput`), тож параметр адреси
 * ніколи не потрапляє на сторінку як текст: невідоме значення просто не
 * покаже нічого.
 */
function isLessonMessageKey(value: string | string[] | undefined): value is MessageKey {
  return typeof value === "string" && value.startsWith("lessons.err") && value in DICT.uk;
}
