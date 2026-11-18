import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeProductModel, PRODUCT_MODELS } from "@/lib/ai/models";
import { ASSIST_PROMPT_VERSION } from "@/lib/ai/prompts/closures";
import { scoreCase, type GoldenCase } from "@/lib/ai/scorer";
import { NEEDS_MORE_DETAILS, proposeClosures, type SuggestResult } from "@/lib/ai/suggest";
import casesJson from "../tests/fixtures/golden/cases.json";

/**
 * ЖИВИЙ прогін golden cases PM на безкоштовних моделях OpenRouter.
 *
 * Ніколи не в `npm test` і не в CI: окремий конфіг `vitest.eval.config.mts`.
 * Потрібен ваш ключ у `.env.local`; без ключа всі кейси пропускаються — це не
 * помилка.
 *
 *   RUNS=2    — кілька прогонів поспіль для частки успіху;
 *   RECORD=1  — успішні відповіді дописати в `recorded.json` для офлайн-реплею.
 *
 * PowerShell: `$env:RECORD = "1"; npm run eval; Remove-Item Env:RECORD`
 *
 * **Судді-моделі тут немає, на відміну від набору курсу.** Усі десять кейсів PM
 * перевіряються детерміновано: статус, закриття по полях і згадки, які PM задав
 * словами «must mention / must not». Поле `rubric` у кейсах — це колонка «Why»
 * з таблиці PM, тобто пояснення правила, а не вимога до вільного тексту. Суддя
 * вдвічі збільшив би витрату денного ліміту (20 запитів замість 10) і додав би
 * власну похибку там, де перевірка вже точна.
 *
 * Основа взята з
 * `koldovsky/2026-quitcode-10-ai-features-hw/materials/ai-feature/evals/golden.live.eval.ts`.
 */

const cases = casesJson as GoldenCase[];
const key = process.env.OPENROUTER_API_KEY;
const RECORD = process.env.RECORD === "1";
const RUNS = Math.max(1, Number(process.env.RUNS ?? 1) || 1);
const RECORDED_PATH = "tests/fixtures/golden/recorded.json";
const REPORT_DIR = "evals/reports";

/** Бюджет прогону: по одному виклику моделі на кейс, судді немає. */
const NEEDED = RUNS * cases.length;
/**
 * Пауза між кейсами.
 *
 * 3 секунди з набору курсу тут замало: ліміт 20 запитів/хв рахує **кожну спробу
 * ланцюжка**, а в нас їх до трьох на кейс. Прогін 2026-11-18T20:47 дістав 429 на
 * дев'ятому кейсі, хоча денного ліміту лишалося 35 із 50 — тобто вперся саме в
 * хвилинний. Тому пауза рахується з довжини ланцюжка: 3 спроби × 3 с.
 */
const GAP_MS = 3_000 * PRODUCT_MODELS.length;

/** «Сьогодні» з таблиці PM: без фіксованої дати «yesterday» у GC-05 щодня інше. */
const TODAY = "2026-11-13";

type Recording = { modelId: string; recordedAt: string; promptVersion: string; text: string };
type Row = {
  run: number;
  id: string;
  modelId: string;
  pass: boolean;
  notRun?: boolean;
  why?: string;
};

const rows: Row[] = [];
const fresh: Record<string, Recording> = {};

/** Перший 429 зупиняє прогін: денний ліміт повтором не виправити. */
let stoppedAt: string | undefined;

/**
 * Відповідь моделі для офлайн-реплею.
 *
 * Пишемо **розібрану** відповідь, а не сирі байти: `proposeClosures` сирого
 * тексту назовні не віддає, і додавати його в продуктовий тип заради eval
 * неправильно. Для реплею цього досить — він однаково проганяє текст через ту
 * саму схему й ті самі правила.
 */
function replyOf(result: SuggestResult): string | null {
  if (result.status === "ok") {
    return JSON.stringify({ status: "ok", closures: result.closures, missing: null });
  }
  if (result.status === "refused") {
    return JSON.stringify({ status: "refused", closures: [], missing: null });
  }
  if (result.status === "needs_info") {
    const missing = result.message.startsWith(NEEDS_MORE_DETAILS)
      ? result.message.slice(NEEDS_MORE_DETAILS.length).trim()
      : result.message;
    return JSON.stringify({ status: "needs_info", closures: [], missing });
  }
  return null;
}

describe.skipIf(!key)("golden cases, живий прогін (безкоштовні моделі OpenRouter)", () => {
  beforeAll(async () => {
    // Скільки безкоштовних запитів лишилось сьогодні (UTC-доба; о 02:00 за Києвом — нова).
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
    const body = (await res.json()) as { data?: { free_model_daily_requests?: { remaining?: number } } };
    const remaining = body.data?.free_model_daily_requests?.remaining;
    if (typeof remaining === "number" && remaining < NEEDED) {
      throw new Error(
        `Сьогодні лишилось ${remaining} безкоштовних запитів, потрібно ${NEEDED}. Запустіть завтра або зменште RUNS.`,
      );
    }
  });

  for (let run = 1; run <= RUNS; run++) {
    for (const c of cases) {
      it(`прогін ${run}: golden ${c.id}`, async (ctx) => {
        if (stoppedAt) {
          rows.push({ run, id: c.id, modelId: "—", pass: false, notRun: true, why: `NOT RUN: зупинено після 429 (${stoppedAt})` });
          expect(stoppedAt).toBeTruthy();
          return ctx.skip();
        }

        await sleep(GAP_MS);

        // maxRetries 0: денний 429 повтором не виправити, повтор лише з'їдає ліміт.
        const result = await proposeClosures(c.input, TODAY, makeProductModel(key), {
          maxRetries: 0,
          timeoutMs: 90_000,
        });

        if (result.status === "unavailable" && result.reason === "rate_limited") {
          // Рядок у звіт — ДО перевірки: інакше кейс зник би, і частку успіху
          // рахували б із меншого знаменника.
          stoppedAt = `${c.id}, прогін ${run}`;
          rows.push({ run, id: c.id, modelId: "—", pass: false, notRun: true, why: "NOT RUN: 429 — денний ліміт" });
          expect(stoppedAt).toBeTruthy();
          return ctx.skip();
        }

        const mismatches = scoreCase(c, result);
        // Модель називаємо на КОЖЕН кейс: відмова й «бракує подробиць» — така сама її відповідь.
        const modelId = result.status === "unavailable" ? "—" : (result.modelId ?? "—");
        const pass = mismatches.length === 0;

        rows.push({ run, id: c.id, modelId, pass, why: mismatches.join("; ") });

        // Записуємо ЛИШЕ те, що пройшло: офлайн-реплей у CI має лишатися зеленим.
        const text = pass ? replyOf(result) : null;
        if (RECORD && text !== null) {
          fresh[c.id] = {
            modelId,
            recordedAt: new Date().toISOString(),
            promptVersion: ASSIST_PROMPT_VERSION,
            text,
          };
        }

        expect(mismatches).toEqual([]);
      });
    }
  }

  afterAll(() => {
    console.table(rows); // яка модель із ланцюжка відповіла на кожен кейс
    writeReport();

    if (RECORD && Object.keys(fresh).length > 0) {
      // Злиття, а не заміна: прогін, обірваний 429, зберігає записи решти кейсів.
      const old = JSON.parse(readFileSync(RECORDED_PATH, "utf8")) as Record<string, Recording>;
      writeFileSync(RECORDED_PATH, JSON.stringify({ ...old, ...fresh }, null, 2) + "\n");
    }
  });
});

/** Звіт без секретів: його комітять у PR. */
function writeReport() {
  if (rows.length === 0) return;

  // Частка успіху — лише з кейсів, що дістали відповідь; NOT RUN (ліміт) — окремо.
  const ran = rows.filter((r) => !r.notRun);
  const notRun = rows.filter((r) => r.notRun);
  const passed = ran.filter((r) => r.pass).length;
  const rate = ran.length === 0 ? 0 : Math.round((passed / ran.length) * 100);

  const byModel = new Map<string, Row[]>();
  for (const r of ran) byModel.set(r.modelId, [...(byModel.get(r.modelId) ?? []), r]);

  // Поріг PM: ≥ 8 з 10, причому GC-08, GC-09 і GC-10 мають проходити завжди.
  // Обов'язковий кейс має саме ПРОЙТИ: той, що не запускався через ліміт, не
  // пройшов. Перша версія рахувала лише ті, що впали, — і звіт обірваного
  // прогону бадьоро писав «поріг виконано», хоча GC-09 і GC-10 не бігли взагалі.
  const required = ["GC-08", "GC-09", "GC-10"];
  const requiredMissed = required.filter((id) => !ran.some((r) => r.id === id && r.pass));
  const thresholdMet = passed >= 8 * RUNS && requiredMissed.length === 0;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const lines = [
    `# Живий прогін golden cases — ${new Date().toISOString()}`,
    "",
    `- Промпт: \`${ASSIST_PROMPT_VERSION}\`; ланцюжок: ${PRODUCT_MODELS.map((m) => `\`${m}\``).join(" → ")}`,
    "- Судді-моделі немає: усі кейси PM перевіряються детерміновано (див. заголовок `evals/golden.live.eval.ts`)",
    `- Прогонів: ${RUNS}; кейсів у прогоні: ${cases.length}`,
    `- **Частка успіху: ${passed}/${ran.length} (${rate}%)** — з кейсів, що отримали відповідь`,
    `- Не запущено (NOT RUN): ${notRun.length}${stoppedAt ? ` — ліміт 429, зупинено на: ${stoppedAt}` : ""}`,
    `- **Поріг PM (≥ 8 з 10, обов'язкові GC-08, GC-09, GC-10): ${thresholdMet ? "виконано" : "НЕ виконано"}**${
      requiredMissed.length > 0 ? ` — не пройшли обов'язкові: ${requiredMissed.join(", ")}` : ""
    }`,
    "",
    "| Модель, що відповіла | Пройшло | Усього |",
    "|---|---|---|",
    ...[...byModel].map(([m, rs]) => `| \`${m}\` | ${rs.filter((r) => r.pass).length} | ${rs.length} |`),
    "",
    "| Прогін | Кейс | Модель | Результат | Розбіжності |",
    "|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.run} | ${r.id} | \`${r.modelId}\` | ${r.notRun ? "NOT RUN" : r.pass ? "✅" : "❌"} | ${(r.why ?? "").replaceAll("|", "/")} |`,
    ),
    "",
  ];

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(`${REPORT_DIR}/${stamp}.md`, lines.join("\n"));
  console.log(`Звіт: ${REPORT_DIR}/${stamp}.md`);
}
