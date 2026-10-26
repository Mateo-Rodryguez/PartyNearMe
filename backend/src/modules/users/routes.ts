import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db, type Tx } from "../../db.js";
import { HttpError } from "../../errors.js";
import { clearPicture, pictureUrl, queuePicture } from "../media.js";
import { isModerator } from "../moderation/routes.js";

/** "taken", "talking" or "single"; null shows nothing. The app draws it as a heart. */
const relationshipStatus = z.enum(["taken", "talking", "single"]).nullable();

const ownProfile = z.object({
  id: z.guid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  bio: z.string().nullable(),
  avatar_url: z.string().nullable(),
  relationship_status: relationshipStatus,
  created_at: z.date(),
  interest_ids: z.array(z.number().int()),
  /** Shows the moderator tools in the app. */
  is_moderator: z.boolean(),
});

const publicProfile = z.object({
  id: z.guid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  bio: z.string().nullable(),
  avatar_url: z.string().nullable(),
  relationship_status: relationshipStatus,
  /** Parties hosted plus parties said "going" to, counted once each. */
  parties: z.number().int(),
  followers: z.number().int(),
  following: z.number().int(),
  is_following: z.boolean(),
  is_blocked: z.boolean(),
});

const profileUpdate = z
  .object({
    username: z.string().regex(/^[a-z0-9_.]{3,30}$/, "3-30 lowercase letters, digits, _ or ."),
    display_name: z.string().trim().max(60).nullable(),
    bio: z.string().trim().max(300).nullable(),
    relationship_status: relationshipStatus,
  })
  .partial()
  .strict()
  .refine((u) => Object.keys(u).length > 0, "Nothing to update");

/** Someone in a list: search results, followers, following, blocked accounts. */
const listedPerson = z.object({
  id: z.guid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  relationship_status: relationshipStatus,
  is_following: z.boolean(),
});
type ListedPerson = z.infer<typeof listedPerson>;

const settings = z.object({
  messages_from: z.enum(["everyone", "following"]),
  push_messages: z.boolean(),
  push_rsvps: z.boolean(),
  push_reminders: z.boolean(),
});
const DEFAULT_SETTINGS: z.infer<typeof settings> = {
  messages_from: "everyone",
  push_messages: true,
  push_rsvps: true,
  push_reminders: true,
};

const userParams = z.object({ id: z.guid() });

/** A copy without one key, for columns used only to build a cursor. */
const omit = <T extends object, K extends keyof T & string>(o: T, key: K) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== key)) as Omit<T, K>;
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: z.string().max(200).optional(),
});

const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
const decodeCursor = (cursor: string) => {
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!at || !id || Number.isNaN(Date.parse(at)) || !z.guid().safeParse(id).success) {
    throw new HttpError(400, "Invalid cursor");
  }
  return { at, id };
};

/** Escapes LIKE wildcards so a search for "a_b" means exactly that. */
const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Everyone blocked either way. Read as the owner: RLS only shows a user the blocks
 * they made, not the ones against them.
 */
const blockedEitherWay = async (db: Db, me: string) =>
  (await db<{ id: string }[]>`
    select blocked_id as id from public.blocks where blocker_id = ${me}
    union select blocker_id from public.blocks where blocked_id = ${me}
  `).map((b) => b.id);
const noContent = { 204: z.null() };

export const usersRoutes: FastifyPluginAsyncZod<{ db: Db; mediaBaseUrl: string | undefined }> = async (
  app,
  { db, mediaBaseUrl },
) => {
  const loadOwnProfile = (userId: string) =>
    asUser(db, userId, async (tx) => {
      const [row] = await tx`
        select p.id, p.username, p.display_name, p.bio, p.relationship_status, p.created_at,
               ${pictureUrl(tx, mediaBaseUrl, "p.avatar_variants", "640")} as avatar_url,
               coalesce(array_agg(ui.interest_id order by ui.interest_id)
                        filter (where ui.interest_id is not null), '{}') as interest_ids
        from public.profiles p
        left join public.user_interests ui on ui.user_id = p.id
        where p.id = ${userId}
        group by p.id
      `;
      if (!row) throw new HttpError(404, "Profile not found");
      return row;
    }).then(async (row) => ({ ...row, is_moderator: await isModerator(db, userId) }) as z.infer<typeof ownProfile>);

  app.get("/interests", {
    schema: { response: { 200: z.array(z.object({ id: z.number(), slug: z.string(), name: z.string() })) } },
  }, (request) =>
    asUser(db, request.userId, async (tx) => [
      ...(await tx<{ id: number; slug: string; name: string }[]>`select id, slug, name from public.interests order by id`),
    ]),
  );

  app.get("/me", { schema: { response: { 200: ownProfile } } }, (request) => loadOwnProfile(request.userId));

  app.patch("/me", { schema: { body: profileUpdate, response: { 200: ownProfile } } }, async (request) => {
    const changes = request.body;
    const columns = Object.keys(changes) as (keyof typeof changes)[];
    await asUser(db, request.userId, (tx) =>
      tx`update public.profiles set ${tx(changes, columns)} where id = ${request.userId}`,
    );
    return loadOwnProfile(request.userId);
  });

  /**
   * Sets a photo the user uploaded as their profile picture. It shows once the
   * worker has checked it, usually within seconds; until then the old one stays.
   */
  app.put("/me/avatar", {
    schema: { body: z.object({ upload_id: z.guid() }).strict(), response: { 202: z.null() } },
  }, async (request, reply) => {
    await queuePicture(db, request.userId, request.body.upload_id, { kind: "avatar", target_id: request.userId });
    return reply.status(202).send(null);
  });

  app.delete("/me/avatar", { schema: { response: noContent } }, async (request, reply) => {
    await clearPicture(db, { kind: "avatar", target_id: request.userId });
    return reply.status(204).send(null);
  });

  app.put("/me/interests", {
    schema: {
      body: z.object({
        interest_ids: z.array(z.number().int().min(1).max(32767)).max(10)
          .refine((ids) => new Set(ids).size === ids.length, "Duplicate interest"),
      }),
      response: { 200: ownProfile },
    },
  }, async (request) => {
    const { interest_ids } = request.body;
    await asUser(db, request.userId, async (tx) => {
      await tx`delete from public.user_interests where user_id = ${request.userId}`;
      // An empty list just clears interests (the old API returned a 500 here).
      if (interest_ids.length > 0) {
        await tx`
          insert into public.user_interests ${tx(interest_ids.map((interest_id) => ({ user_id: request.userId, interest_id })))}
        `;
      }
    });
    return loadOwnProfile(request.userId);
  });

  app.get("/users/:id", { schema: { params: userParams, response: { 200: publicProfile } } }, async (request) => {
    const me = request.userId;
    const row = await asUser(db, me, async (tx) => {
      const [profile] = await tx`
        select p.id, p.username, p.display_name, p.bio, p.relationship_status,
               ${pictureUrl(tx, mediaBaseUrl, "p.avatar_variants", "640")} as avatar_url,
               (select count(*)::int from (
                  select e.id from public.events e where e.organiser_id = p.id and e.status = 'published'
                  union
                  select r.event_id from public.rsvps r join public.events e on e.id = r.event_id
                  where r.user_id = p.id and r.status = 'going' and e.status = 'published'
                ) hosted_or_going) as parties,
               (select count(*)::int from public.follows where followee_id = p.id) as followers,
               (select count(*)::int from public.follows where follower_id = p.id) as following,
               exists (select 1 from public.follows where follower_id = ${me} and followee_id = p.id) as is_following,
               exists (select 1 from public.blocks where blocker_id = ${me} and blocked_id = p.id) as is_blocked
        from public.profiles p
        where p.id = ${request.params.id}
      `;
      return profile;
    });
    if (!row) throw new HttpError(404, "User not found");
    return row as z.infer<typeof publicProfile>;
  });

  const personColumns = (tx: Tx, me: string) => tx`
    p.id, p.username, p.display_name, p.relationship_status,
    ${pictureUrl(tx, mediaBaseUrl, "p.avatar_variants", "150")} as avatar_url,
    exists (select 1 from public.follows f where f.follower_id = ${me} and f.followee_id = p.id) as is_following
  `;

  /**
   * Finds people by username or name. Usernames that start with the text come
   * first, then names containing it, then the people with most followers.
   */
  app.get("/users/search", {
    schema: {
      querystring: z.object({
        q: z.string().trim().min(1).max(60),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      response: { 200: z.object({ users: z.array(listedPerson) }) },
    },
  }, async (request) => {
    const me = request.userId;
    const text = request.query.q.replace(/^@+/, "").trim().toLowerCase();
    if (!text) return { users: [] };
    const prefix = `${likeEscape(text)}%`;
    const contains = `%${likeEscape(text)}%`;
    const hidden = await blockedEitherWay(db, me);
    const rows = await asUser(db, me, (tx) => tx`
      select ${personColumns(tx, me)}
      from public.profiles p
      where p.username is not null and p.id <> ${me}
        and (p.username like ${prefix} or p.display_name ilike ${contains})
        and p.id <> all(${hidden}::uuid[])
      order by p.username = ${text} desc, p.username like ${prefix} desc,
               (select count(*) from public.follows f where f.followee_id = p.id) desc, p.username
      limit ${request.query.limit}
    `);
    return { users: rows as unknown as ListedPerson[] };
  });

  // Followers and following, newest first. People blocked either way are left out.
  for (const [path, joinOn, listed] of [
    ["followers", "followee_id", "follower_id"],
    ["following", "follower_id", "followee_id"],
  ] as const) {
    app.get(`/users/:id/${path}`, {
      schema: {
        params: userParams,
        querystring: listQuery,
        response: { 200: z.object({ users: z.array(listedPerson), next_cursor: z.string().nullable() }) },
      },
    }, async (request) => {
      const me = request.userId;
      const { limit, cursor } = request.query;
      const after = cursor ? decodeCursor(cursor) : null;
      const hidden = await blockedEitherWay(db, me);
      if (hidden.includes(request.params.id)) throw new HttpError(404, "User not found");
      const rows = await asUser(db, me, (tx) => tx`
        select ${personColumns(tx, me)}, f.created_at as followed_at
        from public.follows f join public.profiles p on p.id = f.${tx(listed)}
        where f.${tx(joinOn)} = ${request.params.id}
          and p.id <> all(${hidden}::uuid[])
          ${after ? tx`and (f.created_at, p.id) < (${after.at}::timestamptz, ${after.id}::uuid)` : tx``}
        order by f.created_at desc, p.id desc
        limit ${limit + 1}
      `);
      const page = rows.slice(0, limit) as unknown as (ListedPerson & { followed_at: Date })[];
      const last = page.at(-1);
      return {
        users: page.map((person) => omit(person, "followed_at")),
        next_cursor: rows.length > limit && last ? encodeCursor(last.followed_at, last.id) : null,
      };
    });
  }

  /** The people the user blocked, for unblocking them in settings. */
  app.get("/me/blocks", {
    schema: { response: { 200: z.object({ users: z.array(listedPerson) }) } },
  }, async (request) => {
    const me = request.userId;
    const rows = await asUser(db, me, (tx) => tx`
      select ${personColumns(tx, me)}
      from public.blocks b join public.profiles p on p.id = b.blocked_id
      where b.blocker_id = ${me}
      order by b.created_at desc
      limit 500
    `);
    return { users: rows as unknown as ListedPerson[] };
  });

  const loadSettings = async (me: string) => {
    const [row] = await asUser(db, me, (tx) => tx`
      select messages_from, push_messages, push_rsvps, push_reminders from public.user_settings where user_id = ${me}
    `);
    return (row ?? DEFAULT_SETTINGS) as z.infer<typeof settings>;
  };

  /** Private settings: who can message the user and which push notifications they get. */
  app.get("/me/settings", { schema: { response: { 200: settings } } }, (request) => loadSettings(request.userId));

  app.patch("/me/settings", {
    schema: {
      body: settings.partial().strict().refine((s) => Object.keys(s).length > 0, "Nothing to update"),
      response: { 200: settings },
    },
  }, async (request) => {
    const me = request.userId;
    const changes = request.body;
    const columns = Object.keys(changes) as (keyof typeof changes)[];
    await asUser(db, me, (tx) => tx`
      insert into public.user_settings ${tx({ user_id: me, ...changes }, "user_id", ...columns)}
      on conflict (user_id) do update set ${tx(changes, columns)}, updated_at = now()
    `);
    return loadSettings(me);
  });

  /**
   * Deletes the account and everything it made: removing the auth user cascades to
   * the profile, posts, events, messages and the rest, and the worker then deletes
   * the photo files. Both app stores require this to be possible inside the app.
   */
  app.delete("/me", { schema: { response: noContent } }, async (request, reply) => {
    // Runs as the owner: users can't touch auth.users themselves.
    await db`delete from auth.users where id = ${request.userId}`;
    request.log.info("account deleted");
    return reply.status(204).send(null);
  });

  const relation = (table: "follows" | "blocks", from: "follower_id" | "blocker_id", to: "followee_id" | "blocked_id") => {
    app.put(`/users/:id/${table === "follows" ? "follow" : "block"}`, {
      schema: { params: userParams, response: noContent },
    }, async (request, reply) => {
      if (request.params.id === request.userId) throw new HttpError(400, "Cannot do that to yourself");
      try {
        await asUser(db, request.userId, (tx) => tx`
          insert into ${tx(`public.${table}`)} (${tx(from)}, ${tx(to)})
          values (${request.userId}, ${request.params.id})
          on conflict do nothing
        `);
      } catch (err) {
        if ((err as { code?: string }).code === "23503") throw new HttpError(404, "User not found");
        throw err;
      }
      return reply.status(204).send(null);
    });

    app.delete(`/users/:id/${table === "follows" ? "follow" : "block"}`, {
      schema: { params: userParams, response: noContent },
    }, async (request, reply) => {
      await asUser(db, request.userId, (tx) => tx`
        delete from ${tx(`public.${table}`)}
        where ${tx(from)} = ${request.userId} and ${tx(to)} = ${request.params.id}
      `);
      return reply.status(204).send(null);
    });
  };

  relation("follows", "follower_id", "followee_id");
  relation("blocks", "blocker_id", "blocked_id");
};
