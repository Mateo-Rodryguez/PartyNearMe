import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { authenticate, type TokenVerifier } from "./auth.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { registerErrorHandler } from "./errors.js";
import { eventsRoutes } from "./modules/events/routes.js";
import { usersRoutes } from "./modules/users/routes.js";

export interface AppDeps {
  config: Config;
  db: Db;
  verifyToken: TokenVerifier;
}

/** Builds the API without starting it, so tests can drive it with inject(). */
export async function buildApp({ config, db, verifyToken }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    trustProxy: config.NODE_ENV === "production",
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(rateLimit, { max: config.RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" });

  app.get("/health", async () => ({ status: "ok" }));

  // Everything below requires a signed-in user. The user id comes only from
  // the verified token, never from the request body or query.
  await app.register(async (authed) => {
    authed.decorateRequest("userId", "");
    authed.addHook("preHandler", authenticate(verifyToken));
    await authed.register(usersRoutes, { db });
    await authed.register(eventsRoutes, { db });
  });

  return app;
}
