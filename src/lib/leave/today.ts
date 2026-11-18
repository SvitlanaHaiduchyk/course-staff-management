/**
 * Сьогоднішня дата в київському часі як `YYYY-MM-DD`.
 *
 * Вимога PM: «All dates and times are in Kyiv time (Europe/Kyiv)»
 * (`requirements/05-calendar-assistant.md`, «Assumptions»).
 *
 * Чому не `new Date().toISOString().slice(0, 10)`: це дало б дату за UTC, і з
 * 00:00 до 02:00 за Києвом (взимку) помічник рахував би «yesterday» від
 * учорашнього дня. Для функції, якій PM окремо задав відносні дати, це була б
 * тиха помилка на дві години щодоби.
 *
 * `sv-SE` дає формат `YYYY-MM-DD` без власних розділювачів — це
 * найкоротший спосіб отримати ISO-дату в потрібному поясі.
 */
export function todayInKyiv(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });
}
