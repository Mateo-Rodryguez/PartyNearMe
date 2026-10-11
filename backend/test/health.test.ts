import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = buildApp(loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});

describe("loadConfig", () => {
  it("rejects an invalid port", () => {
    expect(() => loadConfig({ PORT: "not-a-port" })).toThrow(/Invalid configuration/);
  });

  it("applies defaults", () => {
    expect(loadConfig({})).toMatchObject({ NODE_ENV: "development", PORT: 3000 });
  });
});
