import "server-only"; // помилка збірки, якщо цей файл колись імпортує Client Component

import { makeProductModel } from "./models";

/**
 * Єдине місце в `src/`, яке читає `OPENROUTER_API_KEY`.
 *
 * Ключ — власний безкоштовний ключ OpenRouter: локально в `.env.local` (він у
 * `.gitignore`), на проді — Vercel → Project Settings → Environment Variables.
 * НІКОЛИ з префіксом `NEXT_PUBLIC_`: такі значення Next.js вбудовує в
 * JavaScript для браузера. Це перевіряє `tests/ai-key.test.ts`.
 *
 * Немає ключа (або самі пробіли) → `null`: помічник вимикається, а ручне
 * додавання закриття працює далі (`AC-ASSIST-09`). `trim()` тут не косметика —
 * без нього пробіл пішов би в OpenRouter як ключ і повернувся б 401, тобто
 * зовсім інший збій, ніж «ключа немає».
 */
export function productModel() {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key ? makeProductModel(key) : null;
}
