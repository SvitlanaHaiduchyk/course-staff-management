import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isFallback, logLlmCall } from "@/lib/ai/llm-log";
import { PRODUCT_MODELS } from "@/lib/ai/models";
import { ASSIST_PROMPT_VERSION } from "@/lib/ai/prompts/closures";
import { type UnavailableReason } from "@/lib/ai/suggest";

/**
 * Журнал `llm.call` саме для помічника календаря (WS11, трек B).
 *
 * Загальні правила журналу перевіряє `tests/llm-log.test.ts` із набору курсу:
 * у схемі події немає поля для вільного тексту, тож промпт, відповідь моделі
 * чи повідомлення користувача туди не потраплять навіть помилково.
 *
 * Тут інше — **наше** відображення: чотири стани помічника, коди причин
 * недоступності й те, що ланцюжок моделей розпізнається правильно. Назви без
 * AC ID: це технічна перевірка, а не критерій приймання PM.
 */

const base = {
  requestId: "3f0c2a9e-1b7d-4c55-9a3e-2f6d8e1c0b4a",
  route: "/calendar/assistant",
  model: PRODUCT_MODELS[0],
  fallbackUsed: false,
  latencyMs: 1830,
  promptVersion: ASSIST_PROMPT_VERSION,
};

describe("llm.call помічника календаря", () => {
  let info: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("три стани відповіді моделі пишуться рівнем info", () => {
    for (const state of ["ok", "needs_info", "refused"] as const) {
      const parsed = JSON.parse(logLlmCall({ ...base, state }));
      expect(parsed.state).toBe(state);
      expect(parsed.event).toBe("llm.call");
    }

    expect(info).toHaveBeenCalledTimes(3);
    expect(error).not.toHaveBeenCalled();
  });

  it("недоступність пишеться рівнем error — її видно у фільтрі level:error", () => {
    const line = logLlmCall({ ...base, state: "unavailable", errorKind: "rate_limited" });

    expect(error).toHaveBeenCalledWith(line);
    expect(JSON.parse(line)).toMatchObject({ state: "unavailable", errorKind: "rate_limited" });
  });

  it("у журнал іде КОД причини, а не текст повідомлення", () => {
    // Усі причини з `UnavailableReason` — короткі коди, тож проходять формат
    // `token`. Якби сюди колись підставили `result.message`, журнал отримав би
    // речення з пробілами, і поле мовчки випало б — саме цього ми й хочемо.
    const reasons: UnavailableReason[] = [
      "no_key",
      "too_long",
      "rate_limited",
      "timeout",
      "invalid_output",
      "provider_error",
    ];

    for (const errorKind of reasons) {
      expect(JSON.parse(logLlmCall({ ...base, state: "unavailable", errorKind })).errorKind).toBe(errorKind);
    }

    const sentence = JSON.parse(
      logLlmCall({
        ...base,
        state: "unavailable",
        errorKind: "The calendar assistant is unavailable right now. Try again later.",
      }),
    );
    expect(sentence.errorKind).toBeUndefined();
  });

  it("відповідь третьої моделі ланцюжка позначається як fallback", () => {
    // Усі три прогони eval 2026-11-18 відповідала саме третя модель.
    expect(isFallback(PRODUCT_MODELS[2], PRODUCT_MODELS[0])).toBe(true);
    expect(isFallback(PRODUCT_MODELS[0], PRODUCT_MODELS[0])).toBe(false);
    // Постачальник може віддати id без суфікса `:free`.
    expect(isFallback(PRODUCT_MODELS[0].replace(/:free$/, ""), PRODUCT_MODELS[0])).toBe(false);
  });

  it("вставлений текст календаря не потрапляє в журнал навіть як зайве поле", () => {
    const pasted = "Winter break 28.12–08.01, питання до olena.test@example.test";

    const line = logLlmCall({ ...base, state: "ok", text: pasted } as never);

    expect(line).not.toContain("Winter break");
    expect(line).not.toContain("olena.test");
    expect(JSON.parse(line).text).toBeUndefined();
  });
});
