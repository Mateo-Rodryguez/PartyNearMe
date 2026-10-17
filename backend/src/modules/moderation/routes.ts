import { z } from "zod";
import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod";
import { asUser, type Db } from "../../db.js";
import { HttpError } from "../../errors.js";
import { checkLimit } from "../../limits.js";
import { clearPicture } from "../media.js";

/** Posts reported by this many different people are hidden until a moderator looks. */
export const AUTO_HIDE_REPORTS = 3;

const reportBody = z
  .object({
    target_type: z.enum(["post", "event", "user", "message"]),
    target_id: z.string().min(1).max(100),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const TARGET_TYPES = ["post", "event", "user", "message"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

/** What a moderator can do to each kind of thing; "dismiss" closes the reports and changes nothing. */
const ACTIONS: Record<TargetType, readonly string[]> = {
  post: ["remove", "restore", "dismiss"],
  event: ["remove", "restore", "dismiss"],
  user: ["remove_picture", "delete_account", "dismiss"],
  message: ["remove", "dismiss"],
};

const preview = z.object({
  title: z.string(),
  body: z.string().nullable(),
  image_url: z.string().nullable(),
  status: z.string().nullable(),
  /** The person who made it, or the reported person themselves. */
  user_id: z.guid().nullable(),
});

const queueItem = z.object({
  target_type: z.enum(TARGET_TYPES),
  target_id: z.string(),
  report_count: z.number().int(),
  reasons: z.array(z.string()),
  first_reported_at: z.date(),
  /** Null when the thing was deleted after it was reported. */
  preview: preview.nullable(),
});

const actionBody = z
  .object({
    target_type: z.enum(TARGET_TYPES),
    target_id: z.string().min(1).max(100),
    action: z.enum(["remove", "restore", "dismiss", "remove_picture", "delete_account"]),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((b) => ACTIONS[b.target_type].includes(b.action), { message: "That action doesn't apply here", path: ["action"] });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the user may use the moderator tools. Runs as the owner: users can't read the list. */
export async function isModerator(db: Db, userId: string): Promise<boolean> {
  const [row] = await db`select 1 from public.moderators where user_id = ${userId}`;
  return row !== undefined;
}

/**
 * Reporting, which both app stores require for user-generated content, and the
 * moderator tools for acting on reports (docs/moderation.md).
 */
export const moderationRoutes: FastifyPluginAsyncZod<{ db: Db; mediaBaseUrl: string | undefined }> = async (
  app,
  { db, mediaBaseUrl },
) => {
  const mediaUrl = (key: string | null | undefined) => (key && mediaBaseUrl ? `${mediaBaseUrl}/${key}` : null);
  app.post("/reports", {
    schema: { body: reportBody, response: { 204: z.null() } },
  }, async (request, reply) => {
    const me = request.userId;
    await checkLimit(db, me, "report");
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

  /**
   * Everything moderators can see and do; all of it runs as the owner, because
   * moderators need to see hidden posts and other people's reports.
   */
  await app.register(async (plain) => {
    const mod = plain.withTypeProvider<ZodTypeProvider>();
    mod.addHook("preHandler", async (request) => {
      if (!(await isModerator(db, request.userId))) throw new HttpError(403, "Moderators only");
    });

    const loadPreview = async (type: TargetType, id: string): Promise<z.infer<typeof preview> | null> => {
      if (type === "message") {
        if (!/^\d{1,18}$/.test(id)) return null;
        const [m] = await db<{ body: string; sender_id: string; name: string | null }[]>`
          select m.body, m.sender_id, coalesce(p.display_name, p.username) as name
          from public.messages m join public.profiles p on p.id = m.sender_id where m.id = ${id}::bigint
        `;
        return m ? { title: `Message from ${m.name ?? "someone"}`, body: m.body, image_url: null, status: null, user_id: m.sender_id } : null;
      }
      if (!UUID.test(id)) return null;
      if (type === "post") {
        const [p] = await db<{ caption: string | null; status: string; author_id: string; name: string | null; key: string | null }[]>`
          select p.caption, p.status, p.author_id, coalesce(a.display_name, a.username) as name,
                 (select coalesce(m.variants ->> '640', m.storage_key) from public.post_media m
                  where m.post_id = p.id order by m.position limit 1) as key
          from public.posts p join public.profiles a on a.id = p.author_id where p.id = ${id}
        `;
        return p ? { title: `Post by ${p.name ?? "someone"}`, body: p.caption, image_url: mediaUrl(p.key), status: p.status, user_id: p.author_id } : null;
      }
      if (type === "event") {
        const [e] = await db<{ title: string; description: string | null; status: string; organiser_id: string; key: string | null }[]>`
          select title, description, status, organiser_id, cover_variants ->> '640' as key from public.events where id = ${id}
        `;
        return e ? { title: e.title, body: e.description, image_url: mediaUrl(e.key), status: e.status, user_id: e.organiser_id } : null;
      }
      const [u] = await db<{ name: string | null; bio: string | null; key: string | null }[]>`
        select coalesce(display_name, username) as name, bio, avatar_variants ->> '640' as key from public.profiles where id = ${id}
      `;
      return u ? { title: u.name ?? "Someone without a name yet", body: u.bio, image_url: mediaUrl(u.key), status: null, user_id: id } : null;
    };

    /** Open reports, one row per reported thing, oldest first. */
    mod.get("/moderation/queue", {
      schema: { response: { 200: z.object({ items: z.array(queueItem) }) } },
    }, async () => {
      const groups = await db<{ target_type: TargetType; target_id: string; report_count: number; reasons: string[]; first_reported_at: Date }[]>`
        select target_type, target_id, count(*)::int as report_count,
               array_agg(reason order by created_at) as reasons, min(created_at) as first_reported_at
        from public.reports where status = 'open'
        group by target_type, target_id
        order by min(created_at)
        limit 50
      `;
      const items = [];
      for (const g of groups) items.push({ ...g, preview: await loadPreview(g.target_type, g.target_id) });
      return { items };
    });

    /** Acts on a reported thing and closes its open reports; every action is logged. */
    mod.post("/moderation/actions", {
      schema: { body: actionBody, response: { 204: z.null() } },
    }, async (request, reply) => {
      const me = request.userId;
      const { target_type: type, target_id: id, action, note } = request.body;
      const validId = type === "message" ? /^\d{1,18}$/.test(id) : UUID.test(id);
      if (action !== "dismiss" && !validId) throw new HttpError(404, "Not found");

      let changed = 1;
      if (type === "post" && action === "remove") {
        changed = (await db`update public.posts set status = 'removed' where id = ${id}`).count;
      } else if (type === "post" && action === "restore") {
        changed = (await db`update public.posts set status = 'visible' where id = ${id} and status in ('hidden', 'removed')`).count;
      } else if (type === "event" && action === "remove") {
        changed = (await db`update public.events set status = 'removed' where id = ${id}`).count;
      } else if (type === "event" && action === "restore") {
        changed = (await db`update public.events set status = 'published' where id = ${id} and status = 'removed'`).count;
      } else if (type === "message" && action === "remove") {
        changed = (await db`delete from public.messages where id = ${id}::bigint`).count;
      } else if (type === "user" && action === "remove_picture") {
        changed = (await db`select 1 from public.profiles where id = ${id}`).count;
        if (changed) await clearPicture(db, { kind: "avatar", target_id: id });
      } else if (type === "user" && action === "delete_account") {
        if (id === me) throw new HttpError(400, "Use Delete account to delete your own account");
        changed = (await db`delete from auth.users where id = ${id}`).count;
      }
      if (changed === 0) throw new HttpError(404, "Not found, or already in that state");

      await db.begin(async (tx) => {
        await tx`
          update public.reports set status = ${action === "dismiss" || action === "restore" ? "dismissed" : "actioned"}
          where target_type = ${type} and target_id = ${id} and status = 'open'
        `;
        await tx`
          insert into public.moderation_actions (moderator_id, target_type, target_id, action, note)
          values (${me}, ${type}, ${id}, ${action}, ${note ?? null})
        `;
      });
      request.log.info({ target_type: type, target_id: id, action }, "moderation action");
      return reply.status(204).send(null);
    });
  });
};
