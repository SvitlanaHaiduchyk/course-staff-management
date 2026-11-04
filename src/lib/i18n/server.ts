import { cookies } from "next/headers";

import { DEFAULT_LANG, isLang, messages, type Lang, type MessageKey } from "./dict";

/** Ім'я cookie з вибраною мовою. Серверна дія `setLanguage` пише саме його. */
export const LANG_COOKIE = "lang";

/** Рік: вибір мови — не сесія, його не має скидати вихід із порталу. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Мова цього запиту. Невідоме значення cookie мовчки замінюємо на типову:
 * це налаштування вигляду, а не дані, і крива cookie не має валити сторінку.
 */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

/** Мова й перекладач одним викликом — те, що потрібно сторінці. */
export async function getMessages(): Promise<{
  lang: Lang;
  m: (key: MessageKey) => string;
}> {
  const lang = await getLang();
  return { lang, m: messages(lang) };
}
