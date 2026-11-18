import {
  APICallError,
  NoObjectGeneratedError,
  Output,
  RetryError,
  generateText,
  type LanguageModel,
} from "ai";

import { MAX_TEXT_LENGTH, assistInstructions, wrapDocument } from "./prompts/closures";
import { AssistantReplySchema, type SuggestedClosure } from "./schema";

/**
 * Помічник календаря: вставлений текст → запропоновані закриття.
 *
 * Вимоги: `requirements/05-calendar-assistant.md` (знімок 2026-11-18);
 * рішення: `docs/decisions/0003-ai-feature-openrouter.md`.
 *
 * Чиста функція: модель приходить параметром. Застосунок передає модель
 * OpenRouter (`src/lib/ai/openrouter.ts`), тести — `MockLanguageModelV4` із
 * записаною відповіддю. Тут немає ні `import "server-only"`, ні `process.env`,
 * тому Vitest може імпортувати цей файл.
 *
 * Помічник нічого не зберігає: він лише повертає пропозиції, а записує їх
 * окрема дія після перегляду адміністратором.
 */

/** Дослівні тексти з AC PM. Їх складає наш код, а не модель. */
export const NEEDS_MORE_DETAILS = "The calendar assistant needs more details:";
export const NOT_A_CALENDAR =
  "The calendar assistant only helps to add school closures. Paste the text of the school calendar.";
export const ASSISTANT_UNAVAILABLE =
  "The calendar assistant is unavailable right now. Try again later or add closures manually.";
export const TEXT_TOO_LONG = `The text can be at most ${MAX_TEXT_LENGTH} characters`;
// «Preparing suggestions…» (AC-ASSIST-08) з'явиться разом зі сторінкою помічника:
// текст без того, хто його показує, — мертвий код, і ворота мають рацію.

/**
 * `modelId` є в усіх трьох станах, які дала модель: звіт живого прогону має
 * називати, **хто саме** відповів на кожен кейс, а відмова й «бракує
 * подробиць» — така сама її відповідь, як і пропозиції. У `unavailable`
 * моделі немає: там ніхто не відповів.
 */
export type SuggestResult =
  | { readonly status: "ok"; readonly closures: readonly SuggestedClosure[]; readonly modelId: string }
  | { readonly status: "needs_info"; readonly message: string; readonly modelId?: string }
  | { readonly status: "refused"; readonly message: string; readonly modelId?: string }
  | { readonly status: "unavailable"; readonly message: string; readonly reason: UnavailableReason };

export type UnavailableReason = "no_key" | "too_long" | "rate_limited" | "timeout" | "invalid_output" | "provider_error";

export type SuggestOptions = {
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
};

/**
 * Межа довжини — єдине правило, яке діє ДО моделі (`AC-ASSIST-10`): текст
 * довший за 2000 символів до помічника не доходить узагалі, тож і ліміту не
 * витрачає.
 */
export function checkTextLength(text: string): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  return text.length > MAX_TEXT_LENGTH ? { ok: false, message: TEXT_TOO_LONG } : { ok: true };
}

export async function proposeClosures(
  text: string,
  today: string,
  model: LanguageModel,
  opts: SuggestOptions = {},
): Promise<SuggestResult> {
  try {
    const result = await generateText({
      model,
      instructions: assistInstructions(today), // `system` в AI SDK 7 застаріле
      messages: [{ role: "user", content: [{ type: "text", text: wrapDocument(text) }] }],
      output: Output.object({ name: "assistantReply", schema: AssistantReplySchema }), // generateObject застарілий
      temperature: 0,
      // На безкоштовному тарифі повтор витрачає той самий денний ліміт: 0–1, не типові 2.
      maxRetries: opts.maxRetries ?? 1,
      // Вимога PM: помічник, який не відповів за 30 секунд, вважається недоступним (`AC-ASSIST-09`).
      timeout: opts.timeoutMs ?? 30_000,
    });
    return readReply(result.output, result.response.modelId);
  } catch (error) {
    return unavailable(classifyError(error));
  }
}

/**
 * Модель пропонує — код вирішує, що з цього показати.
 *
 * Тексти `needs_info` і `refused` беремо свої, а не ті, що написала модель:
 * по-перше, PM задав їх дослівно, по-друге, так у відповідь не може потрапити
 * текст самого промпту (`GC-10` прямо цього вимагає).
 */
export function readReply(reply: unknown, modelId: string): SuggestResult {
  const parsed = AssistantReplySchema.safeParse(reply);
  if (!parsed.success) return unavailable("invalid_output");

  const { status, closures, missing } = parsed.data;

  if (status === "refused") return { status: "refused", message: NOT_A_CALENDAR, modelId };

  if (status === "needs_info") {
    const detail = missing?.trim();
    return {
      status: "needs_info",
      message: detail ? `${NEEDS_MORE_DETAILS} ${detail}` : NEEDS_MORE_DETAILS,
      modelId,
    };
  }

  // `ok` без жодної пропозиції — відповідь, якою нічого не покажеш: це збій
  // форми, а не стан вимоги, і мовчки перетворювати його на «бракує подробиць»
  // не можна — PM розрізняє ці випадки.
  if (closures.length === 0) return unavailable("invalid_output");

  return { status: "ok", closures: closures.map(normalize), modelId };
}

/**
 * Скорочений день — завжди одна дата. Те саме тримає обмеження
 * `school_closures_single_day_check` у базі; тут це потрібно раніше, щоб
 * адміністратор не бачив пропозиції, яку база все одно відхилить.
 *
 * Решту правил вимоги 04 — порядок дат, крок 5 хвилин, довжину назви,
 * перетини — перевіряє `add_school_closure` при збереженні, з її дослівними
 * повідомленнями (`AC-ASSIST-04`). Дублювати їх тут не можна: два джерела
 * правди рано чи пізно розійдуться.
 */
function normalize(closure: SuggestedClosure): SuggestedClosure {
  return closure.closesAt === null ? closure : { ...closure, endsOn: closure.startsOn };
}

function unavailable(reason: UnavailableReason): SuggestResult {
  return { status: "unavailable", message: ASSISTANT_UNAVAILABLE, reason };
}

/** Усі збої помічника для людини виглядають однаково (`AC-ASSIST-09`); причина лишається для журналу. */
export function classifyError(error: unknown): UnavailableReason {
  // Після повторів AI SDK загортає останню помилку в RetryError — спершу розгортаємо.
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (NoObjectGeneratedError.isInstance(cause)) return "invalid_output";

  if (APICallError.isInstance(cause)) {
    // OpenRouter може відповісти HTTP 200 з тілом `error`; провайдер тоді кидає statusCode 200 + data.
    const code = cause.statusCode === 200 ? (cause.data as { code?: unknown } | undefined)?.code : cause.statusCode;
    if (code === 429 || code === "429") return "rate_limited";
  }

  if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) return "timeout";

  return "provider_error";
}

export { MAX_TEXT_LENGTH };
