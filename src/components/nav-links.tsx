"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";

/** Пункт навігації: куди веде й що написано. Підписи вже перекладені на сервері. */
export type NavItem = {
  readonly href: string;
  readonly label: string;
};

/**
 * Посилання шапки з позначкою поточної сторінки.
 *
 * Клієнтський компонент лише тому, що потрібен `usePathname()`: серверний шлях
 * не бачить. Нічого про сесію чи роль сюди не передаємо — хто що бачить,
 * вирішує `AppNav` на сервері, а тут уже готовий список.
 *
 * Збіг точний, без `startsWith`: інакше `/balances/<чужий id>` підсвічував би
 * «Мої залишки», хоч це сторінка іншого працівника.
 *
 * Поточна сторінка позначена трьома способами, не лише кольором: `aria-current`
 * для екранного читача, насиченіший фон і жирніший текст (DESIGN.md, розділ 7).
 */
export function NavLinks({ items, label }: { items: readonly NavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const current = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={buttonVariants({
              variant: current ? "secondary" : "ghost",
              size: "sm",
              className: current ? "font-semibold" : undefined,
            })}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
