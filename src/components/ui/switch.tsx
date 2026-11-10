import { cn } from "cn";

/**
 * Об'ємний перемикач.
 *
 * Вигляд — елемент Uiverse: Yaya Mohamed (Yaya12085),
 * https://uiverse.io/Yaya12085/bright-dolphin-91, MIT License.
 * Сам CSS — у `src/app/globals.css`, блок «Перемикач Uiverse switch»; там же
 * пояснено три відмінності від оригіналу (стан через `data-checked`, видиме
 * кільце фокуса, префікс у назвах класів).
 *
 * Стану компонент не тримає: `checked` і поведінку дає той, хто його ставить.
 * Тому він працює і як кнопка серверної форми (`type="submit"`), і в
 * клієнтському стані — без `"use client"` у самому компоненті.
 *
 * Сам по собі перемикач не каже, що означає «увімкнено»: поряд має бути текст
 * (DESIGN.md, розділ 7 — стан ніколи не лише кольором чи положенням).
 */
export function Switch({
  checked,
  small = false,
  className,
  ...props
}: React.ComponentProps<"button"> & { checked: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-checked={checked ? "" : undefined}
      data-slot="switch"
      className={cn("uiverse-switch", small && "uiverse-switch--sm", className)}
      {...props}
    />
  );
}
