"use client";

// WS11, трек B: остання межа на клієнті. Помилку рендера, яка дісталася кореня, Next показує
// цим файлом замість усього застосунку — разом із власним layout, тому тут є <html> і <body>.
// Без нього така помилка до Sentry не дійшла б: `onRequestError` ловить серверні, а
// `Sentry.init` сам по собі — лише ті, що спливли до window.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="uk">
      <body className="bg-background text-foreground">
        <main className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-16">
          <h1 className="text-2xl font-semibold">Сторінка не відкрилася</h1>
          <p className="text-sm text-muted-foreground">
            Помилку вже записано. Спробуйте оновити сторінку; якщо не допомогло — напишіть
            адміністратору.
          </p>
          {error.digest ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              Код для адміністратора: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
