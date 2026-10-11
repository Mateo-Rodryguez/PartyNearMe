import { generateKeyPair } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Db } from "../../src/db.js";
import { createTestApp } from "../helpers.js";

const USER = "6f1c2a3e-5b7d-4c8e-9f00-112233445566";

describe("authentication", () => {
  let app: FastifyInstance;
  let sign: Awaited<ReturnType<typeof createTestApp>>["sign"];

  beforeAll(async () => {
    // No database: every request here must be rejected before reaching it.
    ({ app, sign } = await createTestApp({} as Db));
  });
  afterAll(() => app.close());

  const getMe = (authorization?: string) =>
    app.inject({ method: "GET", url: "/me", headers: authorization ? { authorization } : {} });

  it("rejects a request with no token", async () => {
    expect((await getMe()).statusCode).toBe(401);
  });

  it("rejects a malformed header", async () => {
    expect((await getMe("Token abc")).statusCode).toBe(401);
    expect((await getMe("Bearer not.a.jwt")).statusCode).toBe(401);
  });

  it("rejects a token signed with another key", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    expect((await getMe(`Bearer ${await sign(USER, { key: privateKey })}`)).statusCode).toBe(401);
  });

  it("rejects an expired token", async () => {
    expect((await getMe(`Bearer ${await sign(USER, { expiresIn: "-1m" })}`)).statusCode).toBe(401);
  });

  it("rejects a token from another issuer", async () => {
    const token = await sign(USER, { issuer: "https://evil.supabase.co/auth/v1" });
    expect((await getMe(`Bearer ${token}`)).statusCode).toBe(401);
  });

  it("rejects a signed-out (anon) token", async () => {
    expect((await getMe(`Bearer ${await sign(USER, { role: "anon" })}`)).statusCode).toBe(401);
  });

  it("does not leak details in the error", async () => {
    const res = await getMe();
    expect(res.json()).toEqual({ error: "request_failed", message: "Missing bearer token" });
  });
});
