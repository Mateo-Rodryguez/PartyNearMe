import { describe, expect, it } from "vitest";
import { DEFAULT_WEB_ORIGINS, loadConfig } from "../../src/config.js";
import { originMatcher } from "../../src/cors.js";
import type { Db } from "../../src/db.js";
import { createTestApp } from "../helpers.js";

describe("originMatcher", () => {
  const allow = originMatcher(DEFAULT_WEB_ORIGINS.split(","));

  it("allows the web app, its previews and local development", () => {
    expect(allow("https://partynearme.pages.dev")).toBe(true);
    expect(allow("https://3f2a1b9c.partynearme.pages.dev")).toBe(true);
    expect(allow("https://feature-x.partynearme.pages.dev")).toBe(true);
    expect(allow("http://localhost:5173")).toBe(true);
  });

  it("refuses other sites and look-alikes", () => {
    expect(allow("https://evil.example")).toBe(false);
    expect(allow("http://partynearme.pages.dev")).toBe(false);
    expect(allow("https://evilpartynearme.pages.dev")).toBe(false);
    expect(allow("https://a.b.partynearme.pages.dev")).toBe(false);
    expect(allow("https://partynearme.pages.dev.evil.example")).toBe(false);
  });

  it("rejects a malformed wildcard", () => {
    expect(() => originMatcher(["https://foo.*.com"])).toThrow(/WEB_ORIGINS/);
  });
});

describe("WEB_ORIGINS", () => {
  it("splits, trims and drops trailing slashes", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u@localhost/db",
      SUPABASE_URL: "https://x.supabase.co",
      WEB_ORIGINS: " https://a.example/ , https://b.example ",
    });
    expect(config.WEB_ORIGINS).toEqual(["https://a.example", "https://b.example"]);
  });
});

describe("CORS", () => {
  it("answers the web app's preflight", async () => {
    const { app } = await createTestApp({} as Db);
    const res = await app.inject({
      method: "OPTIONS",
      url: "/feed",
      headers: {
        origin: "https://partynearme.pages.dev",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://partynearme.pages.dev");
    expect(String(res.headers["access-control-allow-headers"])).toMatch(/authorization/);
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    await app.close();
  });

  it("gives other sites no CORS headers", async () => {
    const { app } = await createTestApp({} as Db);
    const res = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });
});
