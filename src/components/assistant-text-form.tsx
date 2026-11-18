import { PendingButton } from "@/components/pending-button";
import { Label } from "@/components/ui/label";
import { MAX_TEXT_LENGTH } from "@/lib/ai/suggest";
import type { MessageKey } from "@/lib/i18n/dict";

/** AC-ASSIST-08: дослівний текст PM, англійською в обох мовах інтерфейсу. */
const PREPARING = "Preparing suggestions…";

/**
 * Поле для вставленого тексту шкільного календаря.
 *
 * Окремим компонентом, щоб сторінка лишалася сторінкою — читає дані й складає
 * блоки, а не малює поля (те саме, що з `ClosureForm` і `SuggestionList`).
 *
 * `maxLength` тут — зручність для людини, а не перевірка: межу 2000 символів
 * тримає `checkTextLength` у дії, бо поле можна обійти (`AC-ASSIST-10`).
 */
export function AssistantTextForm({
  action,
  m,
}: {
  action: (formData: FormData) => void | Promise<void>;
  m: (key: MessageKey) => string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="assistant-text">{m("assistant.text")}</Label>
        {/*
          Не `Input`: вставлений календар — це кілька рядків, а в `@/components/ui`
          поля з багатьма рядками немає. Класи — ті самі токени, що в `Input`
          (DESIGN.md, розділ 2): власних кольорів тут не з'являється.
        */}
        <textarea
          id="assistant-text"
          name="text"
          rows={8}
          maxLength={MAX_TEXT_LENGTH}
          required
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{`${m("assistant.textHint")} ${MAX_TEXT_LENGTH}.`}</p>
      </div>

      <PendingButton label={m("assistant.ask")} pendingLabel={PREPARING} />
    </form>
  );
}
