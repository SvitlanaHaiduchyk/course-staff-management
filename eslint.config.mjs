import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// AC ID, як його читає ac:coverage (scripts/lib/spec-lib.mjs): лише на початку назви тесту.
const AC = String.raw`AC-[A-Z]+-\d+`;
// Власні модулі, які не мокаємо: src/lib/** (крім адаптерів src/lib/supabase/**) і src/app/** — через аліас
// (@/lib/…, @/app/…) або відносним шляхом (../../src/lib/…). У регулярному виразі esquery не може бути «/», тому
// роздільник — «.».
const OWN_MODULE = String.raw`/^(@|.*src).(lib.(?!supabase([^A-Za-z0-9_-]|$))[A-Za-z0-9_-]|app([^A-Za-z0-9_-]|$))/`;
const NO_OWN_MOCK =
  "Не мокайте власні модулі (src/lib/**, src/app/**) — тестуйте справжній код: SQL/RLS на PGlite, " +
  "введення-виведення — через передані залежності. Мок клієнта Supabase (@/lib/supabase/*) дозволено.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // WS8 · Тести Vitest: вимкнений, сфокусований, порожній чи умовний тест — помилка, а не попередження.
  // `npm run lint` іде з --max-warnings 0 в обов'язковому job app, тож «warn» тут теж валив би CI —
  // пишемо чесно error. Джерело блоку — materials/gates/eslint.config.mjs домашки WS8.
  {
    files: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      // .skip / .todo ховають AC від перевірки (у recommended — warn).
      "vitest/no-disabled-tests": "error",
      // AC ID — лише на початку назви: «… AC-LEAVE-04 …» посередині ac:coverage не порахує.
      // Ми вже наступали на це: «AC-BALANCE-04, AC-BALANCE-07: …» лишило -07 непокритим.
      "vitest/valid-title": [
        "error",
        {
          mustNotMatch: [
            String.raw`^(?!${AC}).*\b${AC}`,
            "AC ID — на самому початку назви тесту, інакше ac:coverage його не порахує.",
          ],
        },
      ],
      // Тест, що розгалужується, сам вирішує, чи щось перевіряти.
      "vitest/no-conditional-in-test": "error",
      "vitest/no-conditional-expect": "error",
      // expect(value, "пояснення") — коректний Vitest.
      "vitest/valid-expect": ["error", { maxArgs: 2 }],
      // Помічники на кшталт expectNoInvite() теж перевірки.
      "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "expect*"] }],
      // rejects.toThrow() без тексту проходить на БУДЬ-ЯКІЙ помилці (одруківка в SQL, немає grant),
      // а не на відмові з AC.
      "vitest/require-to-throw-message": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: `CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/][arguments.0.value=${OWN_MODULE}]`,
          message: NO_OWN_MOCK,
        },
        {
          // vi.mock(import("@/lib/…")) — та сама заборона для форми з import().
          selector: `CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/][arguments.0.source.value=${OWN_MODULE}]`,
          message: NO_OWN_MOCK,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Дані для тестів скриптів (навмисно «зламані» файли).
    "tests/fixtures/**",
    // Згенерований звіт покриття (npm run test:coverage) — не наш код.
    "coverage/**",
  ]),
]);

export default eslintConfig;
