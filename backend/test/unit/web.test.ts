import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { Db } from "../../src/db.js";
import { resetPasswordPage } from "../../src/modules/web/resetPassword.js";
import { createTestKeys, SUPABASE_URL, testConfig } from "../helpers.js";

describe("password reset page", () => {
  it("is a public page that can only talk to Supabase", async () => {
    const keys = await createTestKeys();
    const app = await buildApp({
      config: { ...testConfig, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
      db: {} as Db,
      verifyToken: keys.verifyToken,
      storage: null,
    });
    const res = await app.inject({ method: "GET", url: "/reset-password" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/html/);
    expect(res.headers["content-security-policy"]).toContain(`connect-src ${SUPABASE_URL};`);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toContain(`${SUPABASE_URL}/auth/v1`);
    expect(res.body).toContain("sb_publishable_test");
    await app.close();
  });

  it("says resets aren't set up when the key is missing", () => {
    const html = resetPasswordPage(SUPABASE_URL, undefined);
    expect(html).toContain("aren't set up yet");
    expect(html).not.toContain("<script>");
  });

  it("keeps the settings from breaking out of the script", () => {
    expect(resetPasswordPage(SUPABASE_URL, "</script><b>")).not.toContain("</script><b>");
  });
});
