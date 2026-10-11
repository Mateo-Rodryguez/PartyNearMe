import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";

/** Builds the API without starting it, so tests can drive it with inject(). */
export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    disableRequestLogging: config.NODE_ENV === "test",
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
