import { existsSync } from "node:fs";

import { defineConfig } from "vitest/config";

// `npm run eval` — живий прогін golden cases на безкоштовних моделях. Ніколи не частина `npm test` і CI:
// основний vitest.config.mts бере лише *.test.ts(x), а цей — лише evals/**/*.eval.ts.
// Основа — koldovsky/2026-quitcode-10-ai-features-hw/materials/ai-feature/vitest.eval.config.mts.
//
// Відмінність від набору: ключ беремо `process.loadEnvFile`, а не `loadEnv` з `vite`.
// `vite` у нас не пряма залежність (він приходить із vitest), і ворота `fallow` справедливо
// називають такий імпорт незаявленою залежністю. Той самий спосіб уже вживає playwright.config.ts.
// Файл не друкуємо й не комітимо.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    fileParallelism: false, // по одному запиту: безкоштовний тариф — 20 запитів/хв
    testTimeout: 120_000,
    hookTimeout: 30_000,
    expect: { requireAssertions: true },
  },
});
