// Чи той коміт на деплої, що очікувався.
//
// Інцидент #95 (25.11.2026): два PR злито майже одночасно. Smoke коміта 94857e1 перевіряв прод тоді, коли Vercel уже
// викотив наступний — 423c351. Прод був не зламаний, а на крок попереду: 94857e1 міститься в 423c351. Перевірка
// порівнювала коміти на РІВНІСТЬ, тож законне просування вперед прочитала як збій і відкрила issue.
//
// Правильне питання до прода — не «чи це рівно той коміт», а «чи містить він очікуваний». Відповідає на нього git:
// `merge-base --is-ancestor <очікуваний> <на проді>`. Прод позаду (деплой не пройшов, Instant Rollback) лишається
// збоєм — саме його ця перевірка й має ловити.
//
// Лише для прод-домену, який перемикається між деплоями. Адреса конкретного деплою (preview, staging) віддає свій
// коміт і попереду бути не може, тож там лишається рівність.

import { spawnSync } from "node:child_process";

const FULL_SHA = /^[0-9a-f]{40}$/;

const short = (sha) => String(sha).slice(0, 7);

/**
 * Запуск git. Окремо від `commitContains`, щоб перевірку можна було перевірити тестом без git-репозиторію.
 * Коди виходу `merge-base --is-ancestor`: 0 — предок, 1 — не предок, інше (128) — коміта немає в клоні.
 */
export function gitIsAncestor(expected, actual, cwd) {
  const r = spawnSync("git", ["merge-base", "--is-ancestor", expected, actual], { encoding: "utf8", cwd });
  if (r.error || r.status === null) return "unknown";
  if (r.status === 0) return "yes";
  if (r.status === 1) return "no";
  return "unknown";
}

/**
 * Чи коміт `expected` уже всередині коміта `actual`: "yes" | "no" | "unknown".
 *
 * `actual` приходить із мережі (`/api/health`), тож спершу — перевірка, що це справді повний sha: інакше значення
 * пішло б у git аргументом, а там рядок із `--` на початку був би не комітом, а прапорцем.
 */
export function commitContains(expected, actual, run = gitIsAncestor) {
  if (!FULL_SHA.test(String(expected)) || !FULL_SHA.test(String(actual))) return "unknown";
  if (expected === actual) return "yes";
  return run(expected, actual);
}

/**
 * Висновок про коміт на деплої. `problem` (непорожній рядок) — збій; `note` — рядок у журнал про те, що деплой
 * попереду, а не зламаний.
 */
export function shaVerdict({ base, expected, actual, contains, target }) {
  if (!expected || !actual || expected === actual) return { problem: "", note: "" };

  if (contains === "yes") {
    return {
      problem: "",
      note: `${base} показує ${short(actual)} — новіший за очікуваний ${short(expected)} і містить його: за час перевірки встиг вийти наступний деплой.`,
    };
  }

  const why =
    contains === "unknown"
      ? "не вдалося перевірити, чи новіший коміт містить очікуваний — чи повна історія в checkout (fetch-depth: 0)?"
      : target === "deploy"
        ? "адреса деплою показує інший коміт — чи та адреса в client_payload.url?"
        : "деплой main не пройшов чи зроблено Instant Rollback?";
  return { problem: `${base} показує ${short(actual)}, а очікувався ${short(expected)} — ${why}`, note: "" };
}
