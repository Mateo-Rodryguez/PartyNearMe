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

describe("isPreviewBot", () => {
  it("leaves link-preview fetchers out of share link counts, but not people", async () => {
    const { isPreviewBot } = await import("../../src/modules/web/share.js");
    const bots = [
      "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1 Facebot Twitterbot/1.0", // iMessage
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "TelegramBot (like TwitterBot)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      undefined,
      "",
    ];
    const people = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
      "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    ];
    for (const ua of bots) expect(isPreviewBot(ua), ua).toBe(true);
    for (const ua of people) expect(isPreviewBot(ua), ua).toBe(false);
  });
});
