import { setLanguage } from "@/app/language-actions";
import { Switch } from "@/components/ui/switch";
import { messages, type Lang } from "@/lib/i18n/dict";

/**
 * Перемикач мови інтерфейсу: UKR / ENG.
 *
 * Форма із серверною дією, а не клієнтський компонент: мову треба знати ДО
 * рендеру, і так перемикач працює без JavaScript. Сам перемикач —
 * `type="submit"` зі значенням ПРОТИЛЕЖНОЇ мови: натиснув — подалася форма.
 *
 * Положення ручки сенсу не несе саме по собі, тож обидві мови написано
 * текстом обабіч, а поточна виділена жирним (DESIGN.md, розділ 7). Людина,
 * яка бачить перемикач уперше, не має вгадувати, що означає «праворуч».
 */
export function LanguageSwitch({ lang }: { lang: Lang }) {
  const m = messages(lang);
  const isEnglish = lang === "en";

  return (
    <form action={setLanguage} className="flex items-center gap-2" aria-label={m("lang.switch")}>
      <span className={cnLabel(!isEnglish)} data-testid="lang-uk">
        {m("lang.uk")}
      </span>

      <Switch
        type="submit"
        name="lang"
        value={isEnglish ? "uk" : "en"}
        checked={isEnglish}
        small
        aria-label={m("lang.switch")}
        data-testid="lang-switch"
      />

      <span className={cnLabel(isEnglish)} data-testid="lang-en">
        {m("lang.en")}
      </span>
    </form>
  );
}

/** Поточна мова — жирним і звичайним кольором, інша — приглушена. */
function cnLabel(active: boolean): string {
  return active ? "text-xs font-semibold text-foreground" : "text-xs text-muted-foreground";
}
