import Link from "next/link";

import { signOut } from "@/app/login/actions";
import { LanguageSwitch } from "@/components/language-switch";
import { Button, buttonVariants } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Шапка застосунку: навігація, перемикач мови і вихід.
 *
 * Раніше посилання лежали рядком унизу кожної сторінки — різним набором на
 * кожній, а на `/requests` їх не було зовсім, тож звідти не було як повернутися.
 * Тепер набір один і той самий скрізь.
 *
 * Чому `createClient()`, а не `requirePageSession()`: шапка малюється й на
 * `/login`, де сесії ще немає, і перенаправляти звідти нікуди. Без сесії
 * показуємо лише перемикач мови.
 *
 * Посилання на «Awaiting decision» бачать менеджер і адміністратор — це UX,
 * а не захист: саму сторінку й дію захищають перевірка ролі в них і політики
 * бази (`openspec/changes/impl-leave-decision/design.md`, розділ «Auth»).
 */
export async function AppNav() {
  const { lang, m } = await getMessages();
  const supabase = await createClient();

  // getClaims() перевіряє JWT. getSession() для авторизації на сервері не використовуємо.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return (
      <header className="flex justify-end border-b border-border px-6 py-2">
        <LanguageSwitch lang={lang} />
      </header>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();
  const canDecide = profile?.role === "manager" || profile?.role === "admin";

  const link = buttonVariants({ variant: "ghost", size: "sm" });

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-2">
      <nav aria-label={m("nav.main")} className="flex flex-wrap items-center gap-1">
        <Link href="/" className={link}>
          {m("nav.home")}
        </Link>
        <Link href="/requests" className={link}>
          {m("nav.requests")}
        </Link>
        <Link href="/balances" className={link}>
          {m("nav.balances")}
        </Link>
        {canDecide ? (
          <Link href="/decisions" className={link}>
            {m("decisions.awaiting")}
          </Link>
        ) : null}
      </nav>

      <div className="flex items-center gap-2">
        <LanguageSwitch lang={lang} />
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            {m("nav.signOut")}
          </Button>
        </form>
      </div>
    </header>
  );
}
