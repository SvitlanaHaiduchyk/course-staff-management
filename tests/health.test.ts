// D0: /api/health відрізняє «база відповіла» від «база недоступна, призупинена чи ключ хибний».
import { describe, expect, it } from "vitest";
import { appEnvOf, classifyDbProbe, supabaseRefOf } from "@/lib/health";

describe("classifyDbProbe (/api/health)", () => {
  it("рахує базу живою, коли запит пройшов або Postgres відмовив у правах (42501)", () => {
    expect(classifyDbProbe({ status: 200, error: null })).toEqual({ db: "ok", reason: "" });
    expect(classifyDbProbe({ status: 401, error: { code: "42501", message: "permission denied for table profiles" } })).toEqual({
      db: "ok",
      reason: "",
    });
    expect(classifyDbProbe({ status: 400, error: { code: "PGRST100", message: "bad filter" } }).db).toBe("ok");
  });

  it("повідомляє «paused», коли Supabase відповідає 540 (безкоштовний проєкт призупинено)", () => {
    expect(classifyDbProbe({ status: 540, error: { message: "project paused" } })).toEqual({ db: "down", reason: "paused" });
  });

  it("повідомляє про хибний публічний ключ", () => {
    expect(classifyDbProbe({ status: 401, error: { message: "Invalid API key" } })).toEqual({
      db: "down",
      reason: "invalid-api-key",
    });
  });

  it("повідомляє код, коли PostgREST не дістає до бази або мережі немає", () => {
    expect(classifyDbProbe({ status: 503, error: { code: "PGRST002", message: "schema cache" } })).toEqual({
      db: "down",
      reason: "status-503-PGRST002",
    });
    expect(classifyDbProbe({ status: 0, error: { message: "fetch failed" } })).toEqual({ db: "down", reason: "status-0" });
  });
});

describe("середовище й база у /api/health", () => {
  it("APP_ENV називає середовище, бо VERCEL_ENV на staging — це preview", () => {
    // Саме через це D0 сам staging не відрізняв: обидва деплої «preview».
    expect(appEnvOf("staging", "preview")).toBe("staging");
    expect(appEnvOf(undefined, "production")).toBe("production");
    expect(appEnvOf(undefined, undefined)).toBe("local");
  });

  it("порожній APP_ENV не ховає справжнього середовища", () => {
    // Змінну легко створити з порожнім значенням — тоді беремо системну.
    expect(appEnvOf("", "production")).toBe("production");
    expect(appEnvOf("   ", "preview")).toBe("preview");
  });

  it("ref проєкту береться з адреси Supabase", () => {
    expect(supabaseRefOf("https://dolwlriqywfqhnstobei.supabase.co")).toBe("dolwlriqywfqhnstobei");
    expect(supabaseRefOf("https://euwjxwolcxhooqxzgsgp.supabase.co/")).toBe("euwjxwolcxhooqxzgsgp");
  });

  it("чужа або порожня адреса дає unknown, а не половину рядка", () => {
    // Якби тут проліз шматок адреси, у звіті з'явилося б «схоже на ref» — гірше за чесне unknown.
    expect(supabaseRefOf(undefined)).toBe("unknown");
    expect(supabaseRefOf("http://localhost:54321")).toBe("unknown");
    expect(supabaseRefOf("https://example.test")).toBe("unknown");
  });
});
