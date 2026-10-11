import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { Db } from "../../src/db.js";
import { createTestApp } from "../helpers.js";

const baseEnv = { DATABASE_URL: "postgres://u@localhost/db", SUPABASE_URL: "https://x.supabase.co/" };

describe("GET /health", () => {
  it("returns ok without signing in", async () => {
    const { app } = await createTestApp({} as Db);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});

describe("loadConfig", () => {
  it("rejects an invalid port", () => {
    expect(() => loadConfig({ ...baseEnv, PORT: "not-a-port" })).toThrow(/Invalid configuration/);
  });

  it("requires the database and Supabase URLs", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*SUPABASE_URL|SUPABASE_URL[\s\S]*DATABASE_URL/);
  });

  it("applies defaults and trims the trailing slash", () => {
    expect(loadConfig(baseEnv)).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      SUPABASE_URL: "https://x.supabase.co",
    });
  });
});

describe("photo uploads without storage configured", () => {
  it("returns 503", async () => {
    const { app, sign } = await createTestApp({} as Db, null);
    const res = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { authorization: `Bearer ${await sign("6f1c2a3e-5b7d-4c8e-9f00-112233445566")}` },
      payload: { content_type: "image/jpeg", size_bytes: 10 },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
