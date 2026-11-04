import { setLanguage } from "@/app/language-actions";
import { Button } from "@/components/ui/button";
import { messages, type Lang } from "@/lib/i18n/dict";

/**
 * Перемикач мови інтерфейсу: UKR / ENG.
 *
 * Форма із серверною дією, а не клієнтський компонент: мову треба знати ДО
 * рендеру, і так перемикач працює без JavaScript. Поточна мова — `default`,
 * інша — `ghost`, і `aria-pressed` каже про це екранному читачеві: самого
 * кольору для «яка зараз увімкнена» не досить.
 */
export function LanguageSwitch({ lang }: { lang: Lang }) {
  const m = messages(lang);

  return (
    <form action={setLanguage} className="flex items-center gap-1" aria-label={m("lang.switch")}>
      {(["uk", "en"] as const).map((value) => {
        const active = value === lang;
        return (
          <Button
            key={value}
            type="submit"
            name="lang"
            value={value}
            size="xs"
            variant={active ? "default" : "ghost"}
            aria-pressed={active}
            data-testid={`lang-${value}`}
          >
            {m(value === "uk" ? "lang.uk" : "lang.en")}
          </Button>
        );
      })}
    </form>
  );
}
