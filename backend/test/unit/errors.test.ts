import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { HttpError, registerErrorHandler } from "../../src/errors.js";

describe("error reporting", () => {
  it("reports unexpected errors with the route pattern, and not client errors", async () => {
    const reported: Array<{ err: unknown; context: Record<string, unknown> | undefined }> = [];
    const app = Fastify({ logger: false });
    registerErrorHandler(app, (err, context) => reported.push({ err, context }));
    app.get("/posts/:id", async (request) => {
      if ((request.params as { id: string }).id === "missing") throw new HttpError(404, "Post not found");
      throw new Error("database exploded");
    });

    const missing = await app.inject({ method: "GET", url: "/posts/missing" });
    expect(missing.statusCode).toBe(404);
    expect(reported).toHaveLength(0);

    const broken = await app.inject({ method: "GET", url: "/posts/abc?token=secret" });
    expect(broken.statusCode).toBe(500);
    expect(broken.json()).toEqual({ error: "internal", message: "Something went wrong" });
    expect(reported).toHaveLength(1);
    expect((reported[0]?.err as Error).message).toBe("database exploded");
    expect(reported[0]?.context).toMatchObject({ method: "GET", route: "/posts/:id" });
    expect(JSON.stringify(reported[0]?.context)).not.toContain("secret");
    await app.close();
  });
});
