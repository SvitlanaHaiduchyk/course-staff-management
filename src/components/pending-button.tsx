"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Кнопка, яка показує, що помічник працює (`AC-ASSIST-08`).
 *
 * Поки форма подається, кнопка написана `pendingLabel` («Preparing
 * suggestions…») і недоступна — попросити пропозиції вдруге не можна.
 *
 * Це єдине місце зрізу, якому потрібен JavaScript: без нього браузер подасть
 * форму звичайним POST, сторінка працюватиме, але напису не буде. Тримати цей
 * стан у базі або в cookie означало б вигадати сховище заради напису.
 */
export function PendingButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">
      {pending ? pendingLabel : label}
    </Button>
  );
}
