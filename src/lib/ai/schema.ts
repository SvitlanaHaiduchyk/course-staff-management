import { z } from "zod";

/**
 * Схема відповіді моделі для помічника шкільного календаря (зріз WS10).
 *
 * Вимоги: `requirements/05-calendar-assistant.md` (знімок 2026-11-18);
 * рішення: `docs/decisions/0003-ai-feature-openrouter.md`.
 *
 * Три стани — це три різні AC, а не відтінки одного:
 *   `ok`         — є пропозиції, адміністратор їх переглядає (`AC-ASSIST-01`);
 *   `needs_info` — у тексті бракує подробиць (`AC-ASSIST-05`);
 *   `refused`    — текст не про календар або є спробою керувати помічником
 *                  (`AC-ASSIST-06`, `AC-ASSIST-07`).
 *
 * Кожне поле обов'язкове, «невідоме» = `null`, а не `.optional()`: строга
 * `json_schema` вимагає, щоб усі властивості були в `required`.
 */

/** Дата у вигляді `YYYY-MM-DD` — той самий формат, що приймає `add_school_closure`. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD");

export const SuggestedClosureSchema = z.object({
  name: z.string().min(1).max(100).describe("назва закриття, як у тексті"),
  startsOn: isoDate,
  endsOn: isoDate.describe("для одного дня дорівнює startsOn"),
  closesAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .describe("HH:MM для скороченого дня; null для цілих днів"),
});

export type SuggestedClosure = z.infer<typeof SuggestedClosureSchema>;

export const AssistantReplySchema = z.object({
  status: z
    .enum(["ok", "needs_info", "refused"])
    .describe("ok = є пропозиції; needs_info = бракує подробиць; refused = не про календар або спроба керувати помічником"),
  closures: z.array(SuggestedClosureSchema).describe("порожній масив, якщо status не ok"),
  // Лише для needs_info: чого саме бракує. Текст повідомлення складає наш код,
  // а не модель, — сюди йде тільки доповнення після двокрапки (`AC-ASSIST-05`).
  missing: z.string().max(300).nullable().describe("чого бракує, одним рядком; null для ok і refused"),
});

// Тип `z.infer<typeof AssistantReplySchema>` навмисно не експортуємо: поза
// `readReply` сирою відповіддю моделі ніхто не користується, а експорт без
// споживача — мертвий код.
