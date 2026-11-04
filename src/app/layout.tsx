import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { LanguageSwitch } from "@/components/language-switch";
import { getLang } from "@/lib/i18n/server";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Командний проєкт",
  description: "Next.js + Supabase + OpenSpec",
};

// Layout читає cookie мови, тож рендериться динамічно — як і всі сторінки,
// що читають сесію. `lang` на <html> ставимо справжній: від нього залежать
// перенос слів і те, якою мовою читає екранний читач.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="flex justify-end border-b border-border px-6 py-2">
          <LanguageSwitch lang={lang} />
        </header>
        {children}
      </body>
    </html>
  );
}
