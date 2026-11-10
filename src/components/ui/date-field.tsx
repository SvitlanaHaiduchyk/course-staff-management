"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Поле дати з календарем `cally` (MIT, https://github.com/WickyNilliams/cally).
 *
 * Головне рішення: календар — це **покращення**, а не заміна поля.
 * Справжнім полем форми лишається нативний `<input type="date" name="date">`:
 *
 * • форма серверна (`form action`), а `<calendar-date>` не form-associated —
 *   імені в нього немає, і сам він у submit нічого не кладе;
 * • без JavaScript сторінка має лишатися робочою, а веб-компонент без JS не
 *   існує взагалі;
 * • на нативному полі тримаються наші перевірки й `getByLabel` у тестах.
 *
 * Тому календар з'являється лише після того, як модуль завантажився, і лише
 * пише дату в поле. Значення в обох — той самий рядок `YYYY-MM-DD`, тож
 * перетворень немає.
 *
 * Імпорт — динамічний, усередині ефекту: `cally` реєструє кастомні елементи
 * через `customElements`, якого на сервері немає.
 */
export function DateField({
  id,
  name,
  label,
  hint,
  required = false,
  calendarLabel,
  prevMonthLabel,
  nextMonthLabel,
  locale,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  calendarLabel: string;
  prevMonthLabel: string;
  nextMonthLabel: string;
  locale: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void import("cally").then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Календар → поле. `change` кастомного елемента не спливає як подія React,
  // тож вішаємо слухача вручну.
  useEffect(() => {
    const calendar = calendarRef.current;
    const input = inputRef.current;
    if (!calendar || !input) return;

    const onChange = () => {
      const value = (calendar as unknown as { value?: string }).value ?? "";
      input.value = value;
      // Подія потрібна, щоб про зміну дізналися валідація браузера й усе,
      // що слухає поле: пряме присвоєння .value її не викликає.
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    calendar.addEventListener("change", onChange);
    return () => calendar.removeEventListener("change", onChange);
  }, [open, ready]);

  // Поле → календар: людина могла ввести дату з клавіатури.
  const syncCalendar = () => {
    const calendar = calendarRef.current;
    if (calendar) (calendar as unknown as { value?: string }).value = inputRef.current?.value ?? "";
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          id={id}
          name={name}
          type="date"
          required={required}
          onChange={syncCalendar}
          className="flex-1"
        />
        {ready ? (
          <button
            type="button"
            onClick={() => {
              setOpen((value) => !value);
              syncCalendar();
            }}
            aria-expanded={open}
            aria-controls={`${id}-calendar`}
            className="rounded-md border border-input px-3 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {calendarLabel}
          </button>
        ) : null}
      </div>

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      {ready && open ? (
        <div id={`${id}-calendar`} className="cally-wrap">
          {/*
            Підписи кнопок «місяць назад / вперед» cally тримає у своїх слотах
            і за замовчуванням пише англійською. Підставляємо свої — інакше в
            українському інтерфейсі стирчали б Previous і Next.
          */}
          <calendar-date ref={calendarRef} locale={locale} first-day-of-week={1}>
            <span slot="previous">{prevMonthLabel}</span>
            <span slot="next">{nextMonthLabel}</span>
            <calendar-month />
          </calendar-date>
        </div>
      ) : null}
    </div>
  );
}
