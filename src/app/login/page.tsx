import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

import { getMessages } from "@/lib/i18n/server";

import { login } from "./actions";

/** Код помилки з адреси → ключ повідомлення. Самі тексти — у словнику. */
const ERRORS = {
  missing: "login.error.missing",
  invalid: "login.error.invalid",
} as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const { m } = await getMessages();
  const key = typeof error === "string" ? ERRORS[error as keyof typeof ERRORS] : undefined;
  const message = key ? m(key) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      {/*
        Картка — елемент Uiverse (Smit Prajapati, MIT License), кольори зведено
        до наших токенів; CSS у globals.css, блок «Картка входу».

        Підписи полів лишаються видимими `Label` з `htmlFor`, хоча в оригіналі
        їх заміняє placeholder: так вимагає DESIGN.md (розділ 5), і на них
        тримається вхід у наших e2e-тестах (`getByLabel`).
      */}
      <div className="swift-card">
        <h1 className="swift-card__heading">{m("login.title")}</h1>

        <form action={login} className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="ml-2">
              Email
            </Label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="swift-card__input"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="ml-2">
              {m("login.password")}
            </Label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="swift-card__input"
            />
          </div>

          {message ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}

          <button type="submit" className="swift-card__button">
            {m("login.submit")}
          </button>
        </form>
      </div>
    </main>
  );
}
