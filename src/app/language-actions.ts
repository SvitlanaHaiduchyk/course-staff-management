"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { DEFAULT_LANG, isLang } from "@/lib/i18n/dict";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE } from "@/lib/i18n/server";

/**
 * Запам'ятати мову інтерфейсу.
 *
 * Серверна дія, а не клієнтський стан: сторінки рендеряться на сервері, тож
 * мову треба знати до рендеру. Невідоме значення замінюємо на типову — форму
 * надсилає кнопка з фіксованим `value`, але дія відкрита для будь-якого POST.
 *
 * `revalidatePath("/", "layout")` потрібен, бо мова міняє геть усі сторінки.
 */
export async function setLanguage(formData: FormData) {
  const value = formData.get("lang");
  const lang = isLang(value) ? value : DEFAULT_LANG;

  (await cookies()).set(LANG_COOKIE, lang, {
    maxAge: LANG_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
}
