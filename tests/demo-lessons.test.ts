// Демодані занять: кожне заняття має лежати всередині робочих годин своєї
// посади. Без AC ID — вимог PM на заняття немає (ADR 0004).
//
// Чому це тест, а не «і так видно»: заняття поза блоком розкладу малюється
// смугою поза робочими годинами, і сітка тижня виглядає зламаною, хоча код
// правильний. Перевірити очима 35 рядків JSON щоразу ніхто не буде.
//
// Дані синтетичні (`*@example.test`) — те саме перевіряє `requireSyntheticEmail`
// у самому скрипті.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { minutesOfTime } from "../src/lib/leave/week";

type Block = { weekday: number; starts_at: string; ends_at: string };
type Lesson = Block & { subject: string; form: string | null };

function read(name: string) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "supabase", name), "utf8"));
}

const positions: { employee: string; kind: string; schedule?: Block[] }[] =
  read("demo-positions.json").positions;
const plan: { employee: string; kind: string; week: Lesson[] }[] = read("demo-lessons.json").lessons;

const key = (entry: { employee: string; kind: string }) => `${entry.employee}|${entry.kind}`;
const schedules = new Map(positions.map((p) => [key(p), p.schedule ?? []]));

function insideSomeBlock(lesson: Lesson, blocks: readonly Block[]): boolean {
  return blocks.some(
    (block) =>
      block.weekday === lesson.weekday &&
      minutesOfTime(block.starts_at) <= minutesOfTime(lesson.starts_at) &&
      minutesOfTime(lesson.ends_at) <= minutesOfTime(block.ends_at),
  );
}

describe("supabase/demo-lessons.json", () => {
  it("кожна посада з уроками існує в demo-positions.json", () => {
    const unknown = plan.filter((entry) => !schedules.has(key(entry))).map(key);

    expect(unknown).toEqual([]);
  });

  it("кожне заняття лежить усередині блока розкладу своєї посади", () => {
    const outside = plan.flatMap((entry) =>
      entry.week
        .filter((lesson) => !insideSomeBlock(lesson, schedules.get(key(entry)) ?? []))
        .map((lesson) => `${key(entry)} ${lesson.weekday} ${lesson.starts_at}–${lesson.ends_at}`),
    );

    expect(outside).toEqual([]);
  });

  it("кінець заняття пізніший за початок — як lessons_order_check у базі", () => {
    const broken = plan.flatMap((entry) =>
      entry.week
        .filter((lesson) => minutesOfTime(lesson.ends_at) <= minutesOfTime(lesson.starts_at))
        .map((lesson) => `${key(entry)} ${lesson.starts_at}–${lesson.ends_at}`),
    );

    expect(broken).toEqual([]);
  });

  it("адреси лише синтетичні", () => {
    const real = plan.map((entry) => entry.employee).filter((email) => !email.endsWith("@example.test"));

    expect(real).toEqual([]);
  });
});
