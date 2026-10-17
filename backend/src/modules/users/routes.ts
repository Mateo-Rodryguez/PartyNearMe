import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db } from "../../db.js";
import { HttpError } from "../../errors.js";

const ownProfile = z.object({
  id: z.guid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  bio: z.string().nullable(),
  avatar_key: z.string().nullable(),
  created_at: z.date(),
  interest_ids: z.array(z.number().int()),
});

const publicProfile = z.object({
  id: z.guid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  bio: z.string().nullable(),
  avatar_key: z.string().nullable(),
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
  })
  .partial()
  .strict()
  .refine((u) => Object.keys(u).length > 0, "Nothing to update");

const userParams = z.object({ id: z.guid() });
const noContent = { 204: z.null() };

export const usersRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  const loadOwnProfile = (userId: string) =>
    asUser(db, userId, async (tx) => {
      const [row] = await tx`
        select p.id, p.username, p.display_name, p.bio, p.avatar_key, p.created_at,
               coalesce(array_agg(ui.interest_id order by ui.interest_id)
                        filter (where ui.interest_id is not null), '{}') as interest_ids
        from public.profiles p
        left join public.user_interests ui on ui.user_id = p.id
        where p.id = ${userId}
        group by p.id
      `;
      if (!row) throw new HttpError(404, "Profile not found");
      return row as z.infer<typeof ownProfile>;
    });

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
        select p.id, p.username, p.display_name, p.bio, p.avatar_key,
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
