import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { ASSIST_PROMPT_VERSION } from "@/lib/ai/prompts/closures";
import { scoreCase, type GoldenCase } from "@/lib/ai/scorer";
import { proposeClosures } from "@/lib/ai/suggest";
import casesJson from "./fixtures/golden/cases.json";
import recordedJson from "./fixtures/golden/recorded.json";

/**
 * Офлайн-реплей golden cases PM: без мережі й без ключа, тож працює в CI.
 *
 * Кейси — `requirements/05-calendar-assistant.md`, розділ «Golden cases»
 * (знімок 2026-11-18); «сьогодні» в кожному — п'ятниця 2026-11-13, як задав PM.
 *
 * **Що це доводить:** код навколо моделі — промпт із межею `<document>`, схему,
 * три стани, складання текстів і оцінювач. **Чого НЕ доводить:** якість самої
 * моделі. Її показує лише живий прогін `npm run eval`.
 */

type Recording = {
  readonly modelId: string;
  readonly recordedAt: string;
  readonly promptVersion?: string;
  /** true, поки відповідь написана руками, а не записана живим прогоном. */
  readonly stub?: boolean;
  readonly text: string;
};

const cases = casesJson as GoldenCase[];
const recorded = recordedJson as Record<string, Recording>;

/** «Сьогодні» з таблиці PM: без фіксованої дати «yesterday» у GC-05 щодня інше. */
const TODAY = "2026-11-13";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

function replay(text: string, modelId: string) {
  return new MockLanguageModelV4({
    modelId,
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

/** Прогін одного кейса; перевірки лишаються в самому тесті. */
async function replayCase(c: GoldenCase) {
  const rec = recorded[c.id];
  if (!rec) throw new Error(`немає запису для ${c.id} у recorded.json`);

  const model = replay(rec.text, rec.modelId);
  const result = await proposeClosures(c.input, TODAY, model);

  return { mismatches: scoreCase(c, result), sent: JSON.stringify(model.doGenerateCalls[0].prompt) };
}

const byAc = (ac: string) => cases.filter((c) => c.ac === ac);

describe("golden cases PM, офлайн-реплей", () => {
  it.each(byAc("AC-ASSIST-01"))("AC-ASSIST-01: golden $id", async (c) => {
    const { mismatches, sent } = await replayCase(c);
    expect(mismatches).toEqual([]);
    // Недовірений вхід дійшов до моделі загорнутим як дані.
    expect(sent).toContain("<document>");
  });

  it.each(byAc("AC-ASSIST-05"))("AC-ASSIST-05: golden $id", async (c) => {
    const { mismatches, sent } = await replayCase(c);
    expect(mismatches).toEqual([]);
    expect(sent).toContain("<document>");
  });

  it.each(byAc("AC-ASSIST-06"))("AC-ASSIST-06: golden $id", async (c) => {
    const { mismatches, sent } = await replayCase(c);
    expect(mismatches).toEqual([]);
    expect(sent).toContain("<document>");
  });

  it.each(byAc("AC-ASSIST-07"))("AC-ASSIST-07: golden $id", async (c) => {
    const { mismatches, sent } = await replayCase(c);
    expect(mismatches).toEqual([]);
    expect(sent).toContain("<document>");
  });
});

describe("набір golden cases", () => {
  it("усі 10 кейсів PM на місці, кожен має запис поточної версії промпту", () => {
    expect(cases).toHaveLength(10);
    expect(cases.map((c) => c.id)).toEqual([
      "GC-01",
      "GC-02",
      "GC-03",
      "GC-04",
      "GC-05",
      "GC-06",
      "GC-07",
      "GC-08",
      "GC-09",
      "GC-10",
    ]);

    const missing = cases.map((c) => c.id).filter((id) => !recorded[id]);
    expect(missing).toEqual([]);

    // Змінили ASSIST_PROMPT_VERSION — перезапишіть записи живим прогоном (RECORD=1).
    const stale = Object.entries(recorded)
      .filter(([, r]) => r.promptVersion !== ASSIST_PROMPT_VERSION)
      .map(([id]) => id);
    expect(stale).toEqual([]);
  });

  it("кожен запис-заглушка позначений як заглушка", () => {
    // Заглушка доказом якості моделі не є: вона перевіряє лише код навколо неї.
    // Поки хоч один запис позначений `stub`, рядки матриці лишаються «відкладено»,
    // а справжні записи приносить `RECORD=1 npm run eval` (задача 4 плану).
    const unmarked = Object.entries(recorded)
      .filter(([, r]) => r.modelId === "stub" && r.stub !== true)
      .map(([id]) => id);

    expect(unmarked).toEqual([]);
  });
});
