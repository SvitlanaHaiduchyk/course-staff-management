import type { SuggestedClosure } from "@/lib/ai/schema";
import type { MessageKey } from "@/lib/i18n/dict";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Запропоновані закриття — поля форми, а не картки для читання.
 *
 * `AC-ASSIST-03` дозволяє виправити назву, дати й час перед збереженням, тож
 * окремий «режим редагування» не потрібен: виправлення — це просто набрати
 * інше в полі.
 *
 * Прибирання й збереження — одна форма з двома діями: кнопка рядка має власний
 * `formAction`. Так прибирання працює без JavaScript і зберігає виправлення,
 * які адміністратор уже набрав (дія читає всі поля форми, а не cookie).
 */
export function SuggestionList({
  closures,
  saveAction,
  removeAction,
  m,
}: {
  closures: readonly SuggestedClosure[];
  saveAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
  m: (key: MessageKey) => string;
}) {
  return (
    <form action={saveAction} className="flex flex-col gap-6">
      <ol className="flex flex-col gap-6">
        {closures.map((closure, index) => (
          <li key={index} className="flex flex-col gap-3 border-b border-border pb-6 last:border-b-0 last:pb-0">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`suggestion-name-${index}`}>{m("calendar.name")}</Label>
              {/* maxLength не ставимо: межу назви перевіряє add_school_closure (AC-CAL-19). */}
              <Input id={`suggestion-name-${index}`} name="name" defaultValue={closure.name} required />
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`suggestion-starts-${index}`}>{m("calendar.startsOn")}</Label>
                <Input
                  id={`suggestion-starts-${index}`}
                  name="startsOn"
                  type="date"
                  defaultValue={closure.startsOn}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`suggestion-ends-${index}`}>{m("calendar.endsOn")}</Label>
                <Input id={`suggestion-ends-${index}`} name="endsOn" type="date" defaultValue={closure.endsOn} />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`suggestion-closes-${index}`}>{m("calendar.closesAt")}</Label>
                {/* step=300 — крок 5 хвилин; те саме обмеження тримає база. */}
                <Input
                  id={`suggestion-closes-${index}`}
                  name="closesAt"
                  type="time"
                  step={300}
                  defaultValue={closure.closesAt ?? ""}
                  className="w-32"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="outline"
              formAction={removeAction}
              name="index"
              value={String(index)}
              className="self-start"
            >
              {m("calendar.remove")}
            </Button>
          </li>
        ))}
      </ol>

      <Button type="submit" className="self-start">
        {m("assistant.save")}
      </Button>
    </form>
  );
}
