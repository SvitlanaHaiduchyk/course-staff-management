import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Ланцюжок безкоштовних моделей для помічника календаря (зріз WS10).
 *
 * Рішення — `docs/decisions/0003-ai-feature-openrouter.md`.
 * Кандидати звірено `npm run ai:models` 2026-11-18: усі три ще існують.
 *
 * Безкоштовні моделі з'являються й зникають, тож порядок — це пріоритет, а не
 * назавжди. Лише ID із `:free`: платна модель у списку fallback оплачується за
 * своєю ціною.
 *
 * Обидві `gemma-4` НЕ мають structured_outputs: `json_schema` вони можуть
 * проігнорувати. Саме тому поля відповіді повторено словами в промпті, а zod
 * стоїть воротами — те, що не за схемою, це помилка, а не «майже пропозиції».
 * `nemotron-3.5-super-vl` строгу схему має й стоїть останньою саме як запасний
 * варіант із найнадійнішою формою відповіді.
 */
export const PRODUCT_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3.5-super-vl:free",
] as const;

// Модель-суддя для живого eval (`makeJudgeModel`) з'явиться разом із самим
// прогоном: фабрика без того, хто її кличе, — мертвий код.

/**
 * Фабрики приймають ключ параметром і НЕ читають `process.env`: так їх можна
 * імпортувати і в eval-скрипті, і в тестах. У коді застосунку модель бере лише
 * `src/lib/ai/openrouter.ts` (server-only).
 */
export function makeProductModel(apiKey: string | undefined) {
  const openrouter = createOpenRouter({ apiKey, appName: "leave-portal calendar assistant" });
  return openrouter.chat(PRODUCT_MODELS[0], {
    // OpenRouter пробує наступну модель при помилці, ліміті постачальника або простої.
    // Платформний ліміт безкоштовних моделей (20/хв, 50/добу на акаунт) ланцюжок НЕ обходить.
    models: [...PRODUCT_MODELS],
    // Без provider.require_parameters: з ним OpenRouter міг би відкинути Gemma (немає structured_outputs).
    // Плагіна file-parser у наборі курсу тут немає: вимога PM приймає лише вставлений текст
    // (`requirements/05-calendar-assistant.md`, «Out of scope»), а плагін потрібен для PDF.
    reasoning: { effort: "low", exclude: true },
  });
}
