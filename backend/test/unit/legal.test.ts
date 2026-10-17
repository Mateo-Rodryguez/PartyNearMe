import { describe, expect, it } from "vitest";
import type { Db } from "../../src/db.js";
import { privacyPage, termsPage } from "../../src/modules/legal/pages.js";
import { createTestApp } from "../helpers.js";

describe("privacy policy and terms", () => {
  it("are public web pages", async () => {
    const { app } = await createTestApp({} as Db);
    for (const url of ["/privacy", "/terms"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^text\/html/);
    }
    await app.close();
  });

  it("show the contact email, escaped", () => {
    expect(privacyPage("hello@partynearme.app")).toContain('href="mailto:hello@partynearme.app"');
    expect(termsPage('a"<b>@x.y')).not.toContain('a"<b>');
    expect(privacyPage()).toContain("store listing");
  });

  it("explain how to delete the account", () => {
    expect(privacyPage()).toContain("Delete account");
  });
});
