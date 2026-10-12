import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db } from "../../db.js";

/** Posts reported by this many different people are hidden until a moderator looks. */
export const AUTO_HIDE_REPORTS = 3;

const reportBody = z
  .object({
    target_type: z.enum(["post", "event", "user", "message"]),
    target_id: z.string().min(1).max(100),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

/**
 * Reporting, which both app stores require for user-generated content.
 * Moderators work through reports in the Supabase dashboard (docs/moderation.md).
 */
export const moderationRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.post("/reports", {
    schema: { body: reportBody, response: { 204: z.null() } },
  }, async (request, reply) => {
    const me = request.userId;
    const { target_type, target_id, reason } = request.body;
    await asUser(db, me, (tx) => tx`
      insert into public.reports (reporter_id, target_type, target_id, reason)
      values (${me}, ${target_type}, ${target_id}, ${reason})
    `);

    if (target_type === "post") {
      // Runs as the owner: reporters can't read other people's reports.
      await db`
        update public.posts set status = 'hidden'
        where id::text = ${target_id} and status = 'visible'
          and (select count(distinct reporter_id) from public.reports
               where target_type = 'post' and target_id = ${target_id} and status = 'open') >= ${AUTO_HIDE_REPORTS}
      `;
    }
    return reply.status(204).send(null);
  });
};
