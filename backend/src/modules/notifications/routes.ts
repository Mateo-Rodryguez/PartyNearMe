import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db, type Tx } from "../../db.js";
import { pictureUrl } from "../media.js";

const person = z.object({
  id: z.guid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const notification = z.object({
  /** Stable for the same activity, so the app can use it as a list key. */
  id: z.string(),
  type: z.enum(["like", "comment", "tag", "follow", "rsvp", "request", "reminder"]),
  /** Who did it; null for reminders, which come from the app itself. */
  actor: person.nullable(),
  post_id: z.guid().nullable(),
  post_thumbnail_url: z.string().nullable(),
  /** What they wrote, for comments. */
  comment_text: z.string().nullable(),
  event_id: z.guid().nullable(),
  event_title: z.string().nullable(),
  event_cover_url: z.string().nullable(),
  created_at: z.date(),
  /** Newer than the last time the user opened their notifications. */
  unread: z.boolean(),
});

/** How far back notifications go. */
const HISTORY = "30 days";

/**
 * Everything that happened to the user, newest first, worked out from the rows
 * that record it (see the notifications migration). Runs inside asUser, so RLS
 * still decides what is visible: a hidden post's likes drop out by themselves.
 * People the user blocked are left out.
 */
const activity = (tx: Tx, me: string) => tx`
  select 'like' as type, l.user_id as actor_id, l.post_id, null::uuid as event_id, null::uuid as comment_id, l.created_at
  from public.likes l join public.posts p on p.id = l.post_id
  where p.author_id = ${me} and l.user_id <> ${me}
  union all
  select 'comment', c.author_id, c.post_id, null, c.id, c.created_at
  from public.comments c join public.posts p on p.id = c.post_id
  where p.author_id = ${me} and c.author_id <> ${me} and c.status = 'visible'
  union all
  select 'tag', p.author_id, t.post_id, null, null, t.created_at
  from public.post_tags t join public.posts p on p.id = t.post_id
  where t.user_id = ${me} and p.author_id <> ${me} and p.status = 'visible'
  union all
  select 'follow', f.follower_id, null, null, null, f.created_at
  from public.follows f
  where f.followee_id = ${me}
  union all
  select 'rsvp', r.user_id, null, r.event_id, null, r.created_at
  from public.rsvps r join public.events e on e.id = r.event_id
  where e.organiser_id = ${me} and r.user_id <> ${me} and r.status = 'going'
  union all
  -- Someone asking to come to your private party, until you answer.
  select 'request', r.user_id, null, r.event_id, null, r.created_at
  from public.rsvps r join public.events e on e.id = r.event_id
  where e.organiser_id = ${me} and r.status = 'requested'
  union all
  -- A day before a party you're going to; shown once that time has come.
  select 'reminder', null, null, r.event_id, null, greatest(r.created_at, e.starts_at - interval '1 day')
  from public.rsvps r join public.events e on e.id = r.event_id
  where r.user_id = ${me} and r.status = 'going' and e.status = 'published'
    and e.starts_at > now() and e.starts_at - interval '1 day' <= now()
`;

const seenAt = (tx: Tx, me: string) =>
  tx`coalesce((select notifications_seen_at from public.profiles where id = ${me}), '-infinity')`;

const notBlocked = (tx: Tx) =>
  tx`(n.actor_id is null or not exists (select 1 from public.blocks b where b.blocked_id = n.actor_id))`;

export const notificationsRoutes: FastifyPluginAsyncZod<{ db: Db; mediaBaseUrl: string | undefined }> = async (
  app,
  { db, mediaBaseUrl },
) => {
  app.get("/notifications", {
    schema: {
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
      response: { 200: z.object({ notifications: z.array(notification), unread_count: z.number().int() }) },
    },
  }, async (request) => {
    const me = request.userId;
    return asUser(db, me, async (tx) => {
      const rows = await tx<z.infer<typeof notification>[]>`
        select n.type || ':' || coalesce(n.actor_id::text, '') || ':' || coalesce(n.comment_id::text, n.post_id::text, n.event_id::text, '') as id,
               n.type, n.post_id, n.event_id, n.created_at,
               n.created_at > ${seenAt(tx, me)} as unread,
               case when a.id is null then null else json_build_object(
                 'id', a.id, 'username', a.username, 'display_name', a.display_name,
                 'avatar_url', ${pictureUrl(tx, mediaBaseUrl, "a.avatar_variants", "150")}) end as actor,
               (select ${pictureUrl(tx, mediaBaseUrl, "m.variants", "150")}
                from public.post_media m join public.posts p on p.id = m.post_id
                where m.post_id = n.post_id and p.status = 'visible'
                order by m.position limit 1) as post_thumbnail_url,
               (select c.body from public.comments c where c.id = n.comment_id) as comment_text,
               e.title as event_title,
               ${pictureUrl(tx, mediaBaseUrl, "e.cover_variants", "150")} as event_cover_url
        from (${activity(tx, me)}) n
        left join public.profiles a on a.id = n.actor_id
        left join public.events e on e.id = n.event_id
        where n.created_at > now() - ${HISTORY}::interval and ${notBlocked(tx)}
        order by n.created_at desc
        limit ${request.query.limit}
      `;
      return { notifications: [...rows], unread_count: await unreadCount(tx, me) };
    });
  });

  /** How many notifications are new, for the bell's badge. */
  app.get("/notifications/unread", {
    schema: { response: { 200: z.object({ unread_count: z.number().int() }) } },
  }, (request) => asUser(db, request.userId, async (tx) => ({ unread_count: await unreadCount(tx, request.userId) })));

  /** Marks everything up to now as seen, when the user opens their notifications. */
  app.post("/notifications/seen", { schema: { response: { 204: z.null() } } }, async (request, reply) => {
    const me = request.userId;
    await asUser(db, me, (tx) => tx`update public.profiles set notifications_seen_at = now() where id = ${me}`);
    return reply.status(204).send(null);
  });
};

async function unreadCount(tx: Tx, me: string): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    select count(*)::int as n
    from (${activity(tx, me)}) n
    where n.created_at > greatest(${seenAt(tx, me)}, now() - ${HISTORY}::interval) and ${notBlocked(tx)}
  `;
  return row?.n ?? 0;
}
