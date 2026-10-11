import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { createDb, type Db } from "../../src/db.js";
import { createTestApp } from "../helpers.js";

/**
 * Integration tests against a real Postgres with every migration applied
 * (start one with ../supabase/test-db.sh). Each test starts with no users.
 */
export function useDbApp() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set: start a test database with ../supabase/test-db.sh start");
  }

  const ctx = {} as {
    db: Db;
    app: FastifyInstance;
    sign: (sub: string) => Promise<string>;
    createUser: () => Promise<string>;
    as: (userId: string, options: InjectOptions) => Promise<LightMyRequestResponse>;
  };

  beforeAll(async () => {
    ctx.db = createDb(url);
    const { app, sign } = await createTestApp(ctx.db);
    ctx.app = app;
    ctx.sign = (sub) => sign(sub);
    ctx.createUser = async () => {
      const id = randomUUID();
      await ctx.db`insert into auth.users (id, email) values (${id}, ${`${id}@example.com`})`;
      return id;
    };
    ctx.as = async (userId, options) =>
      ctx.app.inject({
        ...options,
        headers: { ...options.headers, authorization: `Bearer ${await ctx.sign(userId)}` },
      });
  });

  beforeEach(async () => {
    await ctx.db`truncate auth.users cascade`;
  });

  afterAll(async () => {
    await ctx.app.close();
    await ctx.db.end();
  });

  return ctx;
}
