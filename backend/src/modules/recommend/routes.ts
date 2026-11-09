import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db } from "../../db.js";
import { HttpError } from "../../errors.js";
import { eventSelect, nearbyEvent, timestamp } from "../events/routes.js";
import { isModerator } from "../moderation/routes.js";
import { rankParties, REASON_KINDS } from "./parties.js";

/** Serve logs are kept this long; enough to measure and tune, not a history of anyone. */
const SERVE_RETENTION = "30 days";

const reason = z.object({ kind: z.enum(REASON_KINDS), text: z.string() });
const forYouEvent = nearbyEvent.extend({
  /** Why it's recommended, ready to show; null when no reason is strong enough to say. */
  reason: reason.nullable(),
});

const forYouQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius_km: z.coerce.number().positive().max(100).default(25),
    from: timestamp.optional(),
    to: timestamp.optional(),
    interest_id: z.coerce.number().int().min(1).max(32767).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  });

const round = (x: number) => Math.round(x * 1000) / 1000;

const rate = z.object({
  impressions: z.number().int(),
  opens: z.number().int(),
  rsvps: z.number().int(),
  likes: z.number().int(),
});

export const recommendRoutes: FastifyPluginAsyncZod<{ db: Db; mediaBaseUrl: string | undefined }> = async (
  app,
  { db, mediaBaseUrl },
) => {
  /**
   * Parties around the user ranked by what they care about (docs/recommendations.md).
   * One page of up to 100: there are rarely more parties in range than that.
   */
  app.get("/events/for-you", {
    schema: {
      querystring: forYouQuery,
      response: { 200: z.object({ events: z.array(forYouEvent), serve_id: z.guid() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const q = request.query;
    const from = q.from ?? new Date().toISOString();
    const to = q.to ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    if (Date.parse(to) <= Date.parse(from)) throw new HttpError(400, "to must be after from");

    const ranked = (await rankParties(db, me, {
      lat: q.lat, lng: q.lng, radiusKm: q.radius_km, from, to, interestId: q.interest_id,
    })).slice(0, q.limit);

    const items = ranked.map((r) => ({
      id: r.id,
      score: round(r.score),
      reason: r.reason?.kind ?? null,
      parts: Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, round(v)])),
    }));
    const serveId = await db.begin(async (tx) => {
      await tx`
        delete from public.recommendation_serves
        where user_id = ${me} and created_at <= now() - ${SERVE_RETENTION}::interval
      `;
      const [row] = await tx<{ id: string }[]>`
        insert into public.recommendation_serves (user_id, surface, items)
        values (${me}, 'for_you_parties', ${tx.json(items)})
        returning id
      `;
      if (!row) throw new Error("insert returned no row");
      return row.id;
    });

    const ids = ranked.map((r) => r.id);
    // Loaded under RLS, as Nearby does, so what the user can't see never leaks.
    const rows = ids.length === 0 ? [] : await asUser(db, me, (tx) => tx`
      select ${eventSelect(tx, me, mediaBaseUrl)},
             extensions.st_distance(e.location,
               extensions.st_setsrid(extensions.st_makepoint(${q.lng}, ${q.lat}), 4326)::extensions.geography)::int
             as distance_m
      from public.events e join public.profiles p on p.id = e.organiser_id
      where e.id = any (${ids}::uuid[])
    `);
    const byId = new Map((rows as unknown as z.infer<typeof nearbyEvent>[]).map((r) => [r.id, r]));
    const events = ranked.flatMap((r) => {
      const e = byId.get(r.id);
      return e ? [{ ...e, reason: r.reason }] : [];
    });
    return { events, serve_id: serveId };
  });

  /**
   * How well recommendations work, for moderators: of what people were shown,
   * how much they opened, RSVP'd to or liked within a day, per list, per reason
   * and per position. Counts only, nobody's name or activity.
   */
  app.get("/moderation/recommendation-stats", {
    schema: {
      querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }),
      response: {
        200: z.object({
          by_day: z.array(rate.extend({ day: z.string(), surface: z.string(), users: z.number().int() })),
          by_reason: z.array(rate.extend({ reason: z.string() })),
          by_position: z.array(rate.extend({ positions: z.string() })),
        }),
      },
    },
  }, async (request) => {
    if (!(await isModerator(db, request.userId))) throw new HttpError(403, "Moderators only");
    const since = `${request.query.days} days`;
    // One impression per person, item, list and day; then whether a day of
    // follow-up came of it. Any open counts, wherever it was opened from.
    const outcomes = db`
      imp as (
        select distinct on (i.user_id, coalesce(i.event_id, i.post_id), i.surface, i.created_at::date)
               i.user_id, i.event_id, i.post_id, i.surface, i.serve_id, i.position, i.created_at
        from public.interactions i
        where i.kind = 'impression' and i.surface is not null and i.user_id is not null
          and i.created_at > now() - ${since}::interval
        order by i.user_id, coalesce(i.event_id, i.post_id), i.surface, i.created_at::date, i.created_at
      ),
      outcome as (
        select imp.*,
          exists (select 1 from public.interactions o
                  where o.user_id = imp.user_id and o.kind = 'open'
                    and (o.event_id = imp.event_id or o.post_id = imp.post_id)
                    and o.created_at between imp.created_at and imp.created_at + interval '1 day') as opened,
          imp.event_id is not null and exists (
                  select 1 from public.rsvps r
                  where r.user_id = imp.user_id and r.event_id = imp.event_id
                    and r.created_at between imp.created_at and imp.created_at + interval '1 day') as rsvpd,
          imp.post_id is not null and exists (
                  select 1 from public.likes l
                  where l.user_id = imp.user_id and l.post_id = imp.post_id
                    and l.created_at between imp.created_at and imp.created_at + interval '1 day') as liked
        from imp
      )
    `;
    const counts = db`
      count(*)::int as impressions, (count(*) filter (where opened))::int as opens,
      (count(*) filter (where rsvpd))::int as rsvps, (count(*) filter (where liked))::int as likes
    `;
    const [byDay, byReason, byPosition] = await Promise.all([
      db`
        with ${outcomes}
        select to_char(created_at::date, 'YYYY-MM-DD') as day, surface,
               count(distinct user_id)::int as users, ${counts}
        from outcome group by 1, 2 order by 1 desc, 2
      `,
      db`
        with ${outcomes}
        select coalesce(item->>'reason', 'none') as reason, ${counts}
        from outcome o
        join public.recommendation_serves s on s.id = o.serve_id
        cross join lateral jsonb_array_elements(s.items) item
        where o.surface = 'for_you_parties' and item->>'id' = o.event_id::text
        group by 1 order by 2 desc
      `,
      db`
        with ${outcomes}
        select case when position < 3 then '1-3' when position < 10 then '4-10' else '11+' end as positions, ${counts}
        from outcome where surface = 'for_you_parties' and position is not null
        group by 1 order by min(position)
      `,
    ]);
    return {
      by_day: byDay as unknown as (z.infer<typeof rate> & { day: string; surface: string; users: number })[],
      by_reason: byReason as unknown as (z.infer<typeof rate> & { reason: string })[],
      by_position: byPosition as unknown as (z.infer<typeof rate> & { positions: string })[],
    };
  });
};
