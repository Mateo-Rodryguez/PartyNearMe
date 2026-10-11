import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

/** Client-facing errors with a status code and a message that is safe to show. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

// Postgres error codes that are the client's fault, mapped to HTTP.
const pgErrors: Record<string, [number, string]> = {
  "23505": [409, "Already exists"],
  "23503": [400, "Refers to something that does not exist"],
  "23514": [400, "Invalid value"],
  "22P02": [400, "Invalid value"],
  "42501": [403, "Not allowed"],
  // Raised by our own database functions with a message meant for the client.
  "22023": [400, ""],
  P0002: [404, ""],
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError & { code?: string }, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: "invalid_request",
        message: "Request is invalid",
        issues: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
      });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: "request_failed", message: err.message });
    }
    const pg = err.code ? pgErrors[err.code] : undefined;
    if (pg) {
      return reply.status(pg[0]).send({ error: "request_failed", message: pg[1] || err.message });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err }, "request failed");
      return reply.status(500).send({ error: "internal", message: "Something went wrong" });
    }
    return reply.status(status).send({ error: "request_failed", message: err.message });
  });
}
