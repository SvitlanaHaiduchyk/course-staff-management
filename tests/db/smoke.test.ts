/** Перевірка, що тестова база піднімається й засів відповідає демо-даним. */

import { beforeAll, describe, expect, it } from "vitest";

import { type LeaveDb, createLeaveDb } from "./supabase-pglite";

let leave: LeaveDb;

beforeAll(async () => {
  leave = await createLeaveDb();
}, 60_000);

describe("тестова база", () => {
  it("застосовує міграції й створює профілі з ролями", async () => {
    const rows = await leave.asService<{ email: string; role: string }>(
      "select email, role from public.profiles order by email",
    );

    expect(rows.map((r) => r.email)).toEqual([
      "admin@example.test",
      "manager1@example.test",
      "manager2@example.test",
      "teacher1@example.test",
      "teacher2@example.test",
    ]);
    expect(rows.find((r) => r.email === "teacher1@example.test")?.role).toBe("employee");
    expect(rows.find((r) => r.email === "admin@example.test")?.role).toBe("admin");
  });

  it("засіває посади, розклад і менеджерів", async () => {
    const [{ count }] = await leave.asService<{ count: string }>(
      "select count(*)::text as count from public.positions",
    );
    const blocks = await leave.asService<{ count: string }>(
      "select count(*)::text as count from public.schedule_blocks",
    );

    expect(Number(count)).toBe(4);
    expect(Number(blocks[0].count)).toBeGreaterThan(0);
  });
});
