import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">{m("login.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={login} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{m("login.password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {message ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit">{m("login.submit")}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
