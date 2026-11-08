import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db } from "../../db.js";
import { HttpError } from "../../errors.js";
import { checkLimit } from "../../limits.js";

/** The answers to "How did you hear about PartyNearMe?" in onboarding. */
export const HEARD_FROM = ["friend", "shared_link", "social_media", "app_store", "venue_or_event", "other"] as const;

const feedbackBody = z
  .object({
    kind: z.enum(["love", "problem", "idea", "nps", "heard_from", "leaving"]),
    /** 0-10, only for kind "nps". */
    score: z.number().int().min(0).max(10).optional(),
    body: z.string().trim().min(1).max(2000).optional(),
    screen: z.string().trim().max(40).optional(),
    platform: z.enum(["android", "ios", "web"]),
    app_version: z.string().trim().max(20).optional(),
  })
  .strict();

/**
 * What people tell us themselves (see the feedback migration and
 * docs/analytics.md). Write-only: nothing here is shown back in the app.
 */
export const feedbackRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.post("/feedback", {
    schema: { body: feedbackBody, response: { 204: z.null() } },
  }, async (request, reply) => {
    const me = request.userId;
    const { kind, score, body, screen, platform, app_version } = request.body;
    if (kind === "nps" && score === undefined) throw new HttpError(400, "Pick a score from 0 to 10");
    if (kind !== "nps" && score !== undefined) throw new HttpError(400, "Only the recommend question takes a score");
    if (kind !== "nps" && !body) throw new HttpError(400, "Write a few words first");
    if (kind === "heard_from" && !(HEARD_FROM as readonly string[]).includes(body ?? "")) {
      throw new HttpError(400, "Unknown answer");
    }
    await checkLimit(db, me, "feedback");
    await asUser(db, me, (tx) => tx`
      insert into public.feedback (user_id, kind, score, body, screen, platform, app_version)
      values (${me}, ${kind}, ${score ?? null}, ${body ?? null}, ${screen ?? null}, ${platform}, ${app_version ?? null})
    `);
    return reply.status(204).send(null);
  });
};
