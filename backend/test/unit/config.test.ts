import { describe, expect, it } from "vitest";
import { databaseUrlProblem, loadConfig } from "../../src/config.js";

const base = { DATABASE_URL: "postgres://u:p@localhost/db", SUPABASE_URL: "https://x.supabase.co/" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({ PORT: 3000, RUN_WORKER: false, SUPABASE_URL: "https://x.supabase.co" });
  });

  it("reads RUN_WORKER as a boolean", () => {
    expect(loadConfig({ ...base, RUN_WORKER: "true" }).RUN_WORKER).toBe(true);
    expect(loadConfig({ ...base, RUN_WORKER: "false" }).RUN_WORKER).toBe(false);
    expect(() => loadConfig({ ...base, RUN_WORKER: "maybe" })).toThrow(/RUN_WORKER/);
  });

  it("rejects a missing database URL", () => {
    expect(() => loadConfig({ SUPABASE_URL: base.SUPABASE_URL })).toThrow(/DATABASE_URL/);
  });
});

describe("databaseUrlProblem", () => {
  const host = "aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
  it("accepts pooler links, including encoded symbols in the password", () => {
    expect(databaseUrlProblem(`postgresql://postgres.ref:abc123@${host}`)).toBeNull();
    expect(databaseUrlProblem(`postgresql://postgres.ref:a%40b%23c@${host}`)).toBeNull();
    expect(databaseUrlProblem(`postgres://u:p@localhost/db`)).toBeNull();
  });

  it("explains common paste mistakes without echoing the value", () => {
    const cases: Record<string, RegExp> = {
      [`DATABASE_URL=postgresql://u:secret@${host}`]: /DATABASE_URL=/,
      [`"postgresql://u:secret@${host}"`]: /quotes/,
      [`@${host}`]: /whole link/,
      [`postgresql://u:se/cret@${host}`]: /%2F/,
      [`postgresql://u:se#cret@${host}`]: /%23/,
      [`postgresql://u:se?cret@${host}`]: /%3F/,
    };
    for (const [value, hint] of Object.entries(cases)) {
      const problem = databaseUrlProblem(value);
      expect(problem, value).toMatch(hint);
      expect(problem).not.toContain("secret");
    }
  });

  it("trims stray spaces and newlines", () => {
    expect(loadConfig({ ...base, DATABASE_URL: ` ${base.DATABASE_URL}\n` }).DATABASE_URL).toBe(base.DATABASE_URL);
  });
});
