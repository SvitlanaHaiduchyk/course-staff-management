/**
 * Демодані списків замін: пари мають бути з наших синтетичних людей, без
 * самопідміни, і кожна людина має існувати в `supabase/demo-users.json`.
 *
 * Без AC ID: це перевірка демо-даних, а не поведінки порталу. Межі самої
 * вимоги перевіряють `tests/db/substitutes.test.ts` і
 * `tests/leave-substitutes.test.ts`.
 *
 * Чому це тест, а не «і так видно»: скрипт пише в базу від імені секретного
 * ключа, повз політики. Помилка у файлі (чужа адреса, людина у власному
 * списку) не впала б на правах, а тихо лягла б у базу.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type Plan = { lists: { employee: string; substitutes: string[] }[] };
type DemoUser = { email: string };

const read = (file: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "supabase", file), "utf8"));

const plan: Plan = read("demo-substitutes.json");
const users: DemoUser[] = read("demo-users.json");
const emails = new Set(users.map((u) => u.email));

describe("supabase/demo-substitutes.json", () => {
  it("містить хоча б один список", () => {
    expect(plan.lists.length).toBeGreaterThan(0);
  });

  it("усі адреси синтетичні й відомі з demo-users.json", () => {
    for (const list of plan.lists) {
      expect(list.employee).toMatch(/^[^@\s]+@example\.test$/);
      expect(emails).toContain(list.employee);

      for (const email of list.substitutes) {
        expect(email).toMatch(/^[^@\s]+@example\.test$/);
        expect(emails).toContain(email);
      }
    }
  });

  it("ніхто не стоїть у власному списку", () => {
    // Те саме тримає обмеження substitutes_not_self_check у базі; тут ловимо
    // помилку до запуску скрипта.
    for (const list of plan.lists) {
      expect(list.substitutes).not.toContain(list.employee);
    }
  });

  it("у списку немає повторів", () => {
    for (const list of plan.lists) {
      expect(new Set(list.substitutes).size).toBe(list.substitutes.length);
    }
  });

  it("серед замін teacher1 є асистент — інакше позначки «With upgrade» ніхто не побачить", () => {
    // AC-SUBST-08 показують саме на парі «вчитель відсутній, асистент підміняє»,
    // тож демо-дані мають її містити.
    const positions: { positions: { employee: string; kind: string; job_title: string }[] } =
      read("demo-positions.json");

    const assistants = new Set(
      positions.positions
        .filter((p) => p.kind === "main" && /assistant/i.test(p.job_title))
        .map((p) => p.employee),
    );

    const teacher = plan.lists.find((l) => l.employee === "teacher1@example.test");
    expect(teacher?.substitutes.some((email) => assistants.has(email))).toBe(true);
  });
});
