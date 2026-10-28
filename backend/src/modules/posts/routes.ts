import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db, type Tx } from "../../db.js";
import { HttpError } from "../../errors.js";
import { checkLimit } from "../../limits.js";
import { IMAGE_TYPES, type ImageType, type MediaStorage } from "../../storage.js";
import { post, postMapper, postSelect, type PostRow } from "./shape.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const postParams = z.object({ id: z.guid() });

/** People one post can tag, as on Instagram. */
const MAX_TAGS = 20;

/**
 * Tags people on a post, leaving out yourself, missing accounts and anyone
 * blocked either way (can_tag), so one bad id doesn't fail the post.
 */
const addTags = (tx: Tx, me: string, postId: string, userIds: string[]) => tx`
  insert into public.post_tags (post_id, user_id)
  select ${postId}, u.id from public.profiles u
  where u.id = any (${userIds}::uuid[]) and u.id <> ${me} and public.can_tag(${postId}, u.id)
  on conflict do nothing
`;

/** A copy without one key, for columns used only to build a cursor. */
const omit = <T extends object, K extends keyof T & string>(o: T, key: K) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== key)) as Omit<T, K>;
const noContent = { 204: z.null() };

const encodeCursor = (p: { created_at: Date; id: string }) =>
  Buffer.from(`${p.created_at.toISOString()}|${p.id}`).toString("base64url");
const decodeCursor = (cursor: string) => {
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !z.guid().safeParse(id).success) {
    throw new HttpError(400, "Invalid cursor");
  }
  return { createdAt, id };
};

export const postsRoutes: FastifyPluginAsyncZod<{
  db: Db;
  storage: MediaStorage | null;
  mediaBaseUrl: string | undefined;
}> = async (app, { db, storage, mediaBaseUrl }) => {
  const toPost = postMapper(mediaBaseUrl);

  const loadPost = async (tx: Tx, me: string, id: string) => {
    const [row] = await tx`
      select ${postSelect(tx, me, mediaBaseUrl)}
      from public.posts p join public.profiles a on a.id = p.author_id
      where p.id = ${id}
    `;
    if (!row) throw new HttpError(404, "Post not found");
    return toPost(row as unknown as PostRow);
  };

  app.post("/uploads", {
    schema: {
      body: z.object({
        content_type: z.enum(Object.keys(IMAGE_TYPES) as [ImageType, ...ImageType[]]),
        size_bytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
      }).strict(),
      response: {
        201: z.object({
          upload_id: z.guid(),
          upload_url: z.string(),
          method: z.literal("PUT"),
          headers: z.record(z.string(), z.string()),
          expires_at: z.date(),
        }),
      },
    },
  }, async (request, reply) => {
    if (!storage) throw new HttpError(503, "Photo uploads are not configured yet");
    const me = request.userId;
    const { content_type, size_bytes } = request.body;
    await checkLimit(db, me, "upload");
    const signed = storage.signUpload(me, content_type, size_bytes);
    const [row] = await asUser(db, me, (tx) => tx`
      insert into public.uploads (user_id, storage_key, content_type, size_bytes)
      values (${me}, ${signed.storageKey}, ${content_type}, ${size_bytes})
      returning id
    `);
    return reply.status(201).send({
      upload_id: row?.id as string,
      upload_url: signed.url,
      method: "PUT" as const,
      headers: signed.headers,
      expires_at: signed.expiresAt,
    });
  });

  app.post("/posts", {
    schema: {
      body: z.object({
        upload_ids: z.array(z.guid()).min(1).max(10),
        caption: z.string().max(2200).optional(),
        event_id: z.guid().optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        place_name: z.string().max(120).optional(),
        tag_ids: z.array(z.guid()).max(MAX_TAGS).optional(),
      }).strict(),
      response: { 201: post },
    },
  }, async (request, reply) => {
    const me = request.userId;
    const b = request.body;
    await checkLimit(db, me, "post");
    const created = await asUser(db, me, async (tx) => {
      const [row] = await tx`
        select public.create_post(
          ${b.upload_ids}::uuid[], ${b.caption ?? null}, ${b.event_id ?? null},
          ${b.lat ?? null}, ${b.lng ?? null}, ${b.place_name ?? null}
        ) as id
      `;
      const id = row?.id as string;
      if (b.tag_ids?.length) await addTags(tx, me, id, b.tag_ids);
      return loadPost(tx, me, id);
    });
    return reply.status(201).send(created);
  });

  app.get("/posts/:id", { schema: { params: postParams, response: { 200: post } } }, (request) =>
    asUser(db, request.userId, (tx) => loadPost(tx, request.userId, request.params.id)),
  );

  app.patch("/posts/:id", {
    schema: {
      params: postParams,
      body: z.object({ caption: z.string().trim().max(2200).nullable() }).strict(),
      response: { 200: post },
    },
  }, (request) => {
    const me = request.userId;
    return asUser(db, me, async (tx) => {
      const updated = await tx`
        update public.posts set caption = ${request.body.caption || null}
        where id = ${request.params.id} and author_id = ${me}
        returning id
      `;
      if (updated.length === 0) throw new HttpError(404, "Post not found");
      return loadPost(tx, me, request.params.id);
    });
  });

  /** Sets who is tagged on your post: people left out are untagged. */
  app.put("/posts/:id/tags", {
    schema: {
      params: postParams,
      body: z.object({ user_ids: z.array(z.guid()).max(MAX_TAGS) }).strict(),
      response: { 200: post },
    },
  }, (request) => {
    const me = request.userId;
    const id = request.params.id;
    const ids = request.body.user_ids;
    return asUser(db, me, async (tx) => {
      const [own] = await tx`select 1 from public.posts where id = ${id} and author_id = ${me}`;
      if (!own) throw new HttpError(404, "Post not found");
      await tx`delete from public.post_tags where post_id = ${id} and user_id <> all (${ids}::uuid[])`;
      await addTags(tx, me, id, ids);
      return loadPost(tx, me, id);
    });
  });

  /** Takes yourself off someone's post. */
  app.delete("/posts/:id/tags/me", { schema: { params: postParams, response: noContent } }, async (request, reply) => {
    const me = request.userId;
    await asUser(db, me, (tx) => tx`delete from public.post_tags where post_id = ${request.params.id} and user_id = ${me}`);
    return reply.status(204).send(null);
  });

  app.delete("/posts/:id", { schema: { params: postParams, response: noContent } }, async (request, reply) => {
    const me = request.userId;
    const deleted = await asUser(db, me, (tx) => tx`
      delete from public.posts where id = ${request.params.id} and author_id = ${me} returning id
    `);
    if (deleted.length === 0) throw new HttpError(404, "Post not found");
    return reply.status(204).send(null);
  });

  app.get("/users/:id/posts", {
    schema: {
      params: z.object({ id: z.guid() }),
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(50).default(24),
        cursor: z.string().max(200).optional(),
      }),
      response: { 200: z.object({ posts: z.array(post), next_cursor: z.string().nullable() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const { limit, cursor } = request.query;
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await asUser(db, me, (tx) => tx`
      select ${postSelect(tx, me, mediaBaseUrl)}
      from public.posts p join public.profiles a on a.id = p.author_id
      where p.author_id = ${request.params.id}
        and p.status in ('pending', 'visible')
        ${after ? tx`and (p.created_at, p.id) < (${after.createdAt}::timestamptz, ${after.id}::uuid)` : tx``}
      order by p.created_at desc, p.id desc
      limit ${limit + 1}
    `);
    const posts = (rows.slice(0, limit) as unknown as PostRow[]).map(toPost);
    const last = posts.at(-1);
    return { posts, next_cursor: rows.length > limit && last ? encodeCursor(last) : null };
  });

  // A party's photos, newest first. People blocked either way are left out, as in the feed.
  app.get("/events/:id/posts", {
    schema: {
      params: z.object({ id: z.guid() }),
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(50).default(24),
        cursor: z.string().max(200).optional(),
      }),
      response: { 200: z.object({ posts: z.array(post), next_cursor: z.string().nullable() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const { limit, cursor } = request.query;
    const after = cursor ? decodeCursor(cursor) : null;
    // Read as the owner: RLS only shows a user the blocks they made, not the ones against them.
    const blocked = await db<{ id: string }[]>`
      select blocked_id as id from public.blocks where blocker_id = ${me}
      union select blocker_id from public.blocks where blocked_id = ${me}
    `;
    const hidden = blocked.map((b) => b.id);
    const rows = await asUser(db, me, async (tx) => {
      const [visible] = await tx`select 1 from public.events where id = ${request.params.id}`;
      if (!visible) throw new HttpError(404, "Event not found");
      return tx`
        select ${postSelect(tx, me, mediaBaseUrl)}
        from public.posts p join public.profiles a on a.id = p.author_id
        where p.event_id = ${request.params.id}
          and p.status in ('pending', 'visible')
          and p.author_id <> all(${hidden}::uuid[])
          ${after ? tx`and (p.created_at, p.id) < (${after.createdAt}::timestamptz, ${after.id}::uuid)` : tx``}
        order by p.created_at desc, p.id desc
        limit ${limit + 1}
      `;
    });
    const posts = (rows.slice(0, limit) as unknown as PostRow[]).map(toPost);
    const last = posts.at(-1);
    return { posts, next_cursor: rows.length > limit && last ? encodeCursor(last) : null };
  });

  app.put("/posts/:id/like", { schema: { params: postParams, response: noContent } }, async (request, reply) => {
    const me = request.userId;
    await asUser(db, me, async (tx) => {
      const [visible] = await tx`select 1 from public.posts where id = ${request.params.id} and status = 'visible'`;
      if (!visible) throw new HttpError(404, "Post not found");
      await tx`
        insert into public.likes (post_id, user_id) values (${request.params.id}, ${me})
        on conflict do nothing
      `;
    });
    return reply.status(204).send(null);
  });

  app.delete("/posts/:id/like", { schema: { params: postParams, response: noContent } }, async (request, reply) => {
    await asUser(db, request.userId, (tx) => tx`
      delete from public.likes where post_id = ${request.params.id} and user_id = ${request.userId}
    `);
    return reply.status(204).send(null);
  });

  /** Bookmarks a post. Only the user sees what they saved. */
  app.put("/posts/:id/save", { schema: { params: postParams, response: noContent } }, async (request, reply) => {
    const me = request.userId;
    await asUser(db, me, async (tx) => {
      const [visible] = await tx`select 1 from public.posts where id = ${request.params.id}`;
      if (!visible) throw new HttpError(404, "Post not found");
      await tx`insert into public.saved_posts (user_id, post_id) values (${me}, ${request.params.id}) on conflict do nothing`;
    });
    return reply.status(204).send(null);
  });

  app.delete("/posts/:id/save", { schema: { params: postParams, response: noContent } }, async (request, reply) => {
    await asUser(db, request.userId, (tx) => tx`
      delete from public.saved_posts where post_id = ${request.params.id} and user_id = ${request.userId}
    `);
    return reply.status(204).send(null);
  });

  /** Saved posts, most recently saved first. Ones that were hidden or removed since drop out. */
  app.get("/me/saved/posts", {
    schema: {
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(50).default(24),
        cursor: z.string().max(200).optional(),
      }),
      response: { 200: z.object({ posts: z.array(post), next_cursor: z.string().nullable() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const { limit, cursor } = request.query;
    const after = cursor ? decodeCursor(cursor) : null;
    const hidden = await db<{ id: string }[]>`
      select blocked_id as id from public.blocks where blocker_id = ${me}
      union select blocker_id from public.blocks where blocked_id = ${me}
    `;
    const rows = await asUser(db, me, (tx) => tx`
      select ${postSelect(tx, me, mediaBaseUrl)}, s.created_at as saved_at
      from public.saved_posts s
      join public.posts p on p.id = s.post_id
      join public.profiles a on a.id = p.author_id
      where s.user_id = ${me}
        and (p.status = 'visible' or p.author_id = ${me})
        and p.author_id <> all(${hidden.map((b) => b.id)}::uuid[])
        ${after ? tx`and (s.created_at, p.id) < (${after.createdAt}::timestamptz, ${after.id}::uuid)` : tx``}
      order by s.created_at desc, p.id desc
      limit ${limit + 1}
    `);
    const page = rows.slice(0, limit) as unknown as (PostRow & { saved_at: Date })[];
    const last = page.at(-1);
    return {
      posts: page.map((row) => toPost(omit(row, "saved_at"))),
      next_cursor: rows.length > limit && last ? encodeCursor({ created_at: last.saved_at, id: last.id }) : null,
    };
  });
};
