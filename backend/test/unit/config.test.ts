import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

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
