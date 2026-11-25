// Перевірка прода «чи містить коміт на деплої очікуваний» — заміна порівнянню на рівність після інциденту #95.
// Найважливіше тут — коди виходу `git merge-base --is-ancestor`: саме на них тримається рішення «збій чи ні»,
// тож їх перевіряємо на справжньому git-репозиторії, а не на підробленому запуску.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import { commitContains, gitIsAncestor, shaVerdict } from "../../scripts/lib/deployed-sha.mjs";

const repo = mkdtempSync(path.join(tmpdir(), "smoke-sha-"));
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

git("init", "-q", "-b", "main");
git("config", "user.email", "smoke@example.test");
git("config", "user.name", "smoke");
git("config", "commit.gpgsign", "false");

function commit(text: string, message: string) {
  writeFileSync(path.join(repo, "a.txt"), text);
  git("add", "a.txt");
  git("commit", "-qm", message);
  return git("rev-parse", "HEAD");
}

const older = commit("1", "перший");
const newer = commit("2", "другий");
const unknownSha = "0".repeat(40);

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("чи коміт на деплої містить очікуваний", () => {
  it("новіший коміт містить старіший", () => {
    expect(gitIsAncestor(older, newer, repo)).toBe("yes");
  });

  it("старіший коміт новішого не містить — це справжній відкат", () => {
    expect(gitIsAncestor(newer, older, repo)).toBe("no");
  });

  it("коміта немає в клоні — «unknown», а не тихе «так»", () => {
    expect(gitIsAncestor(older, unknownSha, repo)).toBe("unknown");
  });

  it("однакові коміти — без запуску git", () => {
    const run = vi.fn();
    expect(commitContains(older, older, run)).toBe("yes");
    expect(run).not.toHaveBeenCalled();
  });

  it("значення з мережі, не схоже на коміт, у git не потрапляє", () => {
    const run = vi.fn((): "yes" => "yes");
    expect(commitContains("--upload-pack=echo", "a".repeat(40), run)).toBe("unknown");
    expect(commitContains("a".repeat(40), "не sha", run)).toBe("unknown");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("висновок про коміт на деплої", () => {
  const base = "https://example.test";

  it("рівно той коміт — жодного рядка", () => {
    expect(shaVerdict({ base, expected: older, actual: older, contains: "yes", target: "prod" })).toEqual({
      problem: "",
      note: "",
    });
  });

  it("прод попереду — рядок у журнал, а не збій (інцидент #95)", () => {
    const verdict = shaVerdict({ base, expected: older, actual: newer, contains: "yes", target: "prod" });
    expect(verdict.problem).toBe("");
    expect(verdict.note).toContain(newer.slice(0, 7));
  });

  it("прод позаду — збій із підказкою про відкат", () => {
    const verdict = shaVerdict({ base, expected: newer, actual: older, contains: "no", target: "prod" });
    expect(verdict.problem).toContain("Instant Rollback");
  });

  it("адреса деплою — інша підказка", () => {
    const verdict = shaVerdict({ base, expected: newer, actual: older, contains: "no", target: "deploy" });
    expect(verdict.problem).toContain("client_payload.url");
  });

  it("не змогли перевірити — збій, і сказано саме це", () => {
    const verdict = shaVerdict({ base, expected: newer, actual: older, contains: "unknown", target: "prod" });
    expect(verdict.problem).toContain("fetch-depth");
  });
});
