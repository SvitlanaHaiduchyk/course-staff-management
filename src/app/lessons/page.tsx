import { addLesson, removeLesson } from "./actions";
import { LessonForm } from "@/components/lesson-form";
import { LessonList } from "@/components/lesson-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DICT, weekdayNames, type MessageKey } from "@/lib/i18n/dict";
import { getMessages } from "@/lib/i18n/server";
import { ownedPositionLabel } from "@/lib/leave/lessons";
import { loadAllPositions } from "@/lib/supabase/all-positions";
import { loadMyLessons } from "@/lib/supabase/my-lessons";
import { requireAdminPage } from "@/lib/supabase/page-session";

/**
 * «Заняття» — уроки й наради всередині робочих годин. Веде АДМІНІСТРАТОР.
 *
 * Вимог PM на заняття немає; рішення, межі й розглянуті варіанти —
 * `docs/decisions/0004-lessons-as-a-layer.md`.
 *
 * Чому не працівник: матриця прав PM (`requirements/product.md`) віддає
 * розклади адміністраторові, а роль `admin` описано як ту, що «manages
 * employees, positions, schedules…». Доки PM не відповів, чи заняття є
 * частиною розкладу, тримаємося суворішого прочитання.
 *
 * ОКРЕМА сторінка з власною відмовою, а не схована кнопка: сторінка — це
 * публічний GET, і працівник, який відкриє її за прямим посиланням, має
 * побачити пояснення, а не чужі дані. Те саме рішення й з тієї ж причини вже
 * прийнято для `/calendar/manage` (`AC-CAL-12`). Останній рубіж — політики
 * `lessons_insert_admin`, `lessons_update_admin`, `lessons_delete_admin`.
 *
 * Сторінка читає cookies, тому рендериться динамічно.
 */
export default async function LessonsPage({ searchParams }: PageProps<"/lessons">) {
  const { lang, m } = await getMessages();
  const { supabase, isAdmin } = await requireAdminPage();
  const { error } = await searchParams;

  if (!isAdmin) {
    // Відмова на сторінці: жодного заняття тут не показано й не змінено.
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold">{m("lessons.title")}</h1>
        <Alert variant="destructive">
          <AlertDescription>{m("lessons.onlyAdmin")}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const positions = await loadAllPositions(supabase);
  const lessons = await loadMyLessons(
    supabase,
    positions.map((p) => p.id),
  );

  const dayNames = weekdayNames(lang);
  // У переліку — хто саме, бо посад однакової назви в школі багато; у виборі
  // форми — той самий підпис, щоб рядок і поле читалися однаково.
  const positionTitles = new Map(
    positions.map((p) => [p.id, ownedPositionLabel(p.owner, p)]),
  );
  const choices = positions.map((p) => ({
    id: p.id,
    job_title: ownedPositionLabel(p.owner, p),
  }));

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
              <LessonForm action={addLesson} positions={choices} dayNames={dayNames} m={m} />
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
