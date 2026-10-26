import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db, type Tx } from "../../db.js";
import { HttpError } from "../../errors.js";
import { checkLimit } from "../../limits.js";
import { pictureUrl } from "../media.js";

const comment = z.object({
  id: z.guid(),
  post_id: z.guid(),
  author: z.object({
    id: z.guid(),
    username: z.string().nullable(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
  }),
  body: z.string(),
  /** "hidden" only ever reaches the comment's author, after moderation took it down. */
  status: z.enum(["visible", "hidden", "removed"]),
  /** The author, or the post's author, may delete it. */
  can_delete: z.boolean(),
  created_at: z.date(),
});
type Comment = z.infer<typeof comment>;

const encodeCursor = (c: { created_at: Date; id: string }) =>
  Buffer.from(`${c.created_at.toISOString()}|${c.id}`).toString("base64url");
const decodeCursor = (cursor: string) => {
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !z.guid().safeParse(id).success) {
    throw new HttpError(400, "Invalid cursor");
  }
  return { createdAt, id };
};

const columns = (tx: Tx, me: string, base: string | undefined) => tx`
  c.id, c.post_id, c.body, c.status, c.created_at,
  (c.author_id = ${me} or p.author_id = ${me}) as can_delete,
  json_build_object('id', a.id, 'username', a.username, 'display_name', a.display_name,
                    'avatar_url', ${pictureUrl(tx, base, "a.avatar_variants", "150")}) as author
`;

/** Comments on posts, newest first, like TikTok: a new comment shows at the top. */
export const commentsRoutes: FastifyPluginAsyncZod<{ db: Db; mediaBaseUrl: string | undefined }> = async (
  app,
  { db, mediaBaseUrl },
) => {
  app.get("/posts/:id/comments", {
    schema: {
      params: z.object({ id: z.guid() }),
      querystring: z.object({
        cursor: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(30),
      }),
      response: { 200: z.object({ comments: z.array(comment), next_cursor: z.string().nullable() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const { cursor, limit } = request.query;
    const after = cursor ? decodeCursor(cursor) : null;
    return asUser(db, me, async (tx) => {
      const [visible] = await tx`select 1 from public.posts where id = ${request.params.id}`;
      if (!visible) throw new HttpError(404, "Post not found");
      // Blocks are readable by the blocker only, so this leaves out people the viewer blocked.
      const rows = await tx<Comment[]>`
        select ${columns(tx, me, mediaBaseUrl)}
        from public.comments c
        join public.posts p on p.id = c.post_id
        join public.profiles a on a.id = c.author_id
        where c.post_id = ${request.params.id}
          and not exists (select 1 from public.blocks b where b.blocker_id = ${me} and b.blocked_id = c.author_id)
          ${after ? tx`and (c.created_at, c.id) < (${after.createdAt}::timestamptz, ${after.id}::uuid)` : tx``}
        order by c.created_at desc, c.id desc
        limit ${limit + 1}
      `;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return { comments: page, next_cursor: rows.length > limit && last ? encodeCursor(last) : null };
    });
  });

  app.post("/posts/:id/comments", {
    schema: {
      params: z.object({ id: z.guid() }),
      body: z.object({ body: z.string().trim().min(1).max(1000) }).strict(),
      response: { 201: comment },
    },
  }, async (request, reply) => {
    const me = request.userId;
    await checkLimit(db, me, "comment");
    const created = await asUser(db, me, async (tx) => {
      const [allowed] = await tx<{ ok: boolean }[]>`select public.can_comment(${request.params.id}) as ok`;
      if (!allowed?.ok) throw new HttpError(404, "Post not found");
      const [row] = await tx<{ id: string }[]>`
        insert into public.comments (post_id, author_id, body)
        values (${request.params.id}, ${me}, ${request.body.body})
        returning id
      `;
      const [loaded] = await tx<Comment[]>`
        select ${columns(tx, me, mediaBaseUrl)}
        from public.comments c
        join public.posts p on p.id = c.post_id
        join public.profiles a on a.id = c.author_id
        where c.id = ${row?.id ?? null}
      `;
      if (!loaded) throw new Error("comment insert returned no row");
      return loaded;
    });
    return reply.status(201).send(created);
  });

  app.delete("/comments/:id", {
    schema: { params: z.object({ id: z.guid() }), response: { 204: z.null() } },
  }, async (request, reply) => {
    const deleted = await asUser(db, request.userId, (tx) => tx`
      delete from public.comments where id = ${request.params.id} returning id
    `);
    if (deleted.length === 0) throw new HttpError(404, "Comment not found");
    return reply.status(204).send(null);
  });
};
