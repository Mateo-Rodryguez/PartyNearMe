import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db } from "../../db.js";
import { HttpError } from "../../errors.js";
import { post, postMapper, postSelect, type PostRow } from "../posts/shape.js";
import { diversify, rankPosts } from "./ranking.js";

/** A snapshot older than this must be refreshed rather than paged. */
const SNAPSHOT_TTL = "1 hour";

const encodeCursor = (snapshotId: string, offset: number) =>
  Buffer.from(`${snapshotId}|${offset}`).toString("base64url");
const decodeCursor = (cursor: string) => {
  const [snapshotId, offset] = Buffer.from(cursor, "base64url").toString().split("|");
  const n = Number(offset);
  if (!snapshotId || !z.guid().safeParse(snapshotId).success || !Number.isInteger(n) || n < 0) {
    throw new HttpError(400, "Invalid cursor");
  }
  return { snapshotId, offset: n };
};

const INTERACTION_KINDS = ["impression", "dwell", "open", "share", "skip", "not_interested"] as const;

const interaction = z
  .object({
    kind: z.enum(INTERACTION_KINDS),
    post_id: z.guid().optional(),
    event_id: z.guid().optional(),
    dwell_ms: z.number().int().min(0).max(60 * 60 * 1000).optional(),
  })
  .strict()
  .refine((i) => i.post_id || i.event_id, "post_id or event_id is required")
  .refine((i) => (i.kind === "dwell") === (i.dwell_ms !== undefined), {
    message: "dwell_ms goes with kind 'dwell' only",
    path: ["dwell_ms"],
  });

export const feedRoutes: FastifyPluginAsyncZod<{ db: Db; mediaBaseUrl: string | undefined }> = async (
  app,
  { db, mediaBaseUrl },
) => {
  const toPost = postMapper(mediaBaseUrl);

  /**
   * The home feed. Without a cursor it ranks a fresh list and returns its
   * first page; the cursor pages through that same list, so nothing repeats
   * or jumps while scores change.
   */
  app.get("/feed", {
    schema: {
      querystring: z
        .object({
          lat: z.coerce.number().min(-90).max(90).optional(),
          lng: z.coerce.number().min(-180).max(180).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(200).optional(),
        })
        .refine((q) => (q.lat === undefined) === (q.lng === undefined), { message: "lat and lng go together" }),
      response: { 200: z.object({ posts: z.array(post), next_cursor: z.string().nullable() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const q = request.query;

    let snapshot: { id: string; post_ids: string[] };
    let offset = 0;
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      const [row] = await db<{ id: string; post_ids: string[] }[]>`
        select id, post_ids from public.feed_snapshots
        where id = ${c.snapshotId} and user_id = ${me} and created_at > now() - ${SNAPSHOT_TTL}::interval
      `;
      if (!row) throw new HttpError(410, "This feed has expired, refresh it");
      snapshot = row;
      offset = c.offset;
    } else {
      const here = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null;
      const ranked = diversify(await rankPosts(db, me, here));
      snapshot = await db.begin(async (tx) => {
        // Expired snapshots go; recent ones stay so another device can keep paging.
        await tx`
          delete from public.feed_snapshots
          where user_id = ${me} and created_at <= now() - ${SNAPSHOT_TTL}::interval
        `;
        const [row] = await tx<{ id: string; post_ids: string[] }[]>`
          insert into public.feed_snapshots (user_id, post_ids)
          values (${me}, ${ranked.map((r) => r.id)}::uuid[])
          returning id, post_ids
        `;
        if (!row) throw new Error("insert returned no row");
        return row;
      });
    }

    const pageIds = snapshot.post_ids.slice(offset, offset + q.limit);
    const nextOffset = offset + q.limit;
    // Loaded under RLS, so posts hidden or deleted since ranking drop out.
    const rows = pageIds.length === 0 ? [] : await asUser(db, me, (tx) => tx`
      select ${postSelect(tx, me, mediaBaseUrl)}
      from public.posts p join public.profiles a on a.id = p.author_id
      where p.id = any (${pageIds}::uuid[]) and p.status = 'visible'
    `);
    const byId = new Map((rows as unknown as PostRow[]).map((r) => [r.id, r]));
    const posts = pageIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toPost(row)] : [];
    });

    return {
      posts,
      next_cursor: nextOffset < snapshot.post_ids.length ? encodeCursor(snapshot.id, nextOffset) : null,
    };
  });

  /** What the user saw and did, sent by the app in batches; feeds ranking and later the recommender. */
  app.post("/interactions", {
    schema: {
      body: z.object({ events: z.array(interaction).min(1).max(50) }).strict(),
      response: { 202: z.null() },
    },
  }, async (request, reply) => {
    const me = request.userId;
    const rows = request.body.events.map((e) => ({
      user_id: me,
      kind: e.kind,
      post_id: e.post_id ?? null,
      event_id: e.event_id ?? null,
      dwell_ms: e.dwell_ms ?? null,
    }));
    // The log is service-only, so this runs as the owner with the user id from the token.
    await db`insert into public.interactions ${db(rows, "user_id", "kind", "post_id", "event_id", "dwell_ms")}`;
    return reply.status(202).send(null);
  });
};
