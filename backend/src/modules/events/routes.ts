import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db, type Tx } from "../../db.js";
import { HttpError } from "../../errors.js";
import { checkLimit } from "../../limits.js";
import { clearPicture, pictureUrl, queuePicture } from "../media.js";

const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const timestamp = z.iso.datetime({ offset: true });

const person = z.object({
  id: z.guid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const event = z.object({
  id: z.guid(),
  organiser: person,
  title: z.string(),
  description: z.string().nullable(),
  starts_at: z.date(),
  ends_at: z.date().nullable(),
  venue_name: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  cover_url: z.string().nullable(),
  status: z.enum(["draft", "published", "cancelled", "removed"]),
  going_count: z.number().int(),
  interested_count: z.number().int(),
  my_rsvp: z.enum(["going", "interested"]).nullable(),
  saved_by_me: z.boolean(),
  /** Up to three people the viewer follows who are going, most recent first. */
  friends_going: z.array(person),
  friends_going_count: z.number().int(),
  created_at: z.date(),
});
type Event = z.infer<typeof event>;

const nearbyEvent = event.extend({ distance_m: z.number().int() });

const eventFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable(),
  starts_at: timestamp,
  ends_at: timestamp.nullable(),
  venue_name: z.string().trim().max(120).nullable(),
  lat,
  lng,
};

const checkTimes = (e: { starts_at?: string | undefined; ends_at?: string | null | undefined }) => {
  if (!e.starts_at || !e.ends_at) return true;
  const ms = Date.parse(e.ends_at) - Date.parse(e.starts_at);
  return ms > 0 && ms <= MAX_DURATION_MS;
};
const timesMessage = { message: "ends_at must be after starts_at and within 7 days", path: ["ends_at"] };

const createEvent = z
  .object({
    ...eventFields,
    description: eventFields.description.optional(),
    ends_at: eventFields.ends_at.optional(),
    venue_name: eventFields.venue_name.optional(),
    publish: z.boolean().default(false),
  })
  .strict()
  .refine(checkTimes, timesMessage)
  .refine((e) => Date.parse(e.starts_at) > Date.now() - 60 * 60 * 1000, {
    message: "starts_at is in the past",
    path: ["starts_at"],
  });

const updateEvent = z
  .object({ ...eventFields, status: z.enum(["draft", "published", "cancelled"]) })
  .partial()
  .strict()
  .refine((e) => Object.keys(e).length > 0, "Nothing to update")
  .refine((e) => (e.lat === undefined) === (e.lng === undefined), { message: "lat and lng go together" })
  .refine(checkTimes, timesMessage);

const nearbyQuery = z.object({
  lat: z.coerce.number().pipe(lat),
  lng: z.coerce.number().pipe(lng),
  radius_km: z.coerce.number().positive().max(100).default(10),
  from: timestamp.optional(),
  to: timestamp.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});

const eventParams = z.object({ id: z.guid() });
const noContent = { 204: z.null() };

// Cursor for "starts_at, id" ordering. Opaque to clients.
const encodeCursor = (e: { starts_at: Date; id: string }) =>
  Buffer.from(`${e.starts_at.toISOString()}|${e.id}`).toString("base64url");
const decodeCursor = (cursor: string) => {
  const [startsAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!startsAt || !id || Number.isNaN(Date.parse(startsAt)) || !z.guid().safeParse(id).success) {
    throw new HttpError(400, "Invalid cursor");
  }
  return { startsAt, id };
};

const point = (tx: Tx, latitude: number, longitude: number) =>
  tx`extensions.st_setsrid(extensions.st_makepoint(${longitude}, ${latitude}), 4326)::extensions.geography`;

/** Columns every event response needs; RLS decides which events are visible. */
const eventSelect = (tx: Tx, me: string, base: string | undefined) => tx`
  e.id, e.title, e.description, e.starts_at, e.ends_at, e.venue_name, e.status, e.created_at,
  ${pictureUrl(tx, base, "e.cover_variants", "1080")} as cover_url,
  extensions.st_y(e.location::extensions.geometry) as lat,
  extensions.st_x(e.location::extensions.geometry) as lng,
  json_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                    'avatar_url', ${pictureUrl(tx, base, "p.avatar_variants", "150")}) as organiser,
  (select count(*)::int from public.rsvps r where r.event_id = e.id and r.status = 'going') as going_count,
  (select count(*)::int from public.rsvps r where r.event_id = e.id and r.status = 'interested') as interested_count,
  (select r.status from public.rsvps r where r.event_id = e.id and r.user_id = ${me}) as my_rsvp,
  exists (select 1 from public.saved_events s where s.event_id = e.id and s.user_id = ${me}) as saved_by_me,
  (select coalesce(json_agg(json_build_object('id', f.id, 'username', f.username, 'display_name', f.display_name,
                                              'avatar_url', ${pictureUrl(tx, base, "f.avatar_variants", "150")})
                            order by f.going_since desc), '[]'::json)
   from (select fp.*, r.created_at as going_since from ${friendsGoing(tx, me)} order by r.created_at desc limit 3) f
  ) as friends_going,
  (select count(*)::int from ${friendsGoing(tx, me)}) as friends_going_count
`;

/**
 * People the viewer follows who said they're going to event e, the social proof
 * event apps lead with ("Sam and 2 friends are going"). Blocked people are left out.
 */
const friendsGoing = (tx: Tx, me: string) => tx`
  public.rsvps r
  join public.follows fo on fo.followee_id = r.user_id and fo.follower_id = ${me}
  join public.profiles fp on fp.id = r.user_id
  where r.event_id = e.id and r.status = 'going'
    and not exists (select 1 from public.blocks b where b.blocker_id = ${me} and b.blocked_id = r.user_id)
`;

export const eventsRoutes: FastifyPluginAsyncZod<{ db: Db; mediaBaseUrl: string | undefined }> = async (
  app,
  { db, mediaBaseUrl },
) => {
  const loadEvent = async (tx: Tx, me: string, id: string): Promise<Event> => {
    const [row] = await tx`
      select ${eventSelect(tx, me, mediaBaseUrl)}
      from public.events e join public.profiles p on p.id = e.organiser_id
      where e.id = ${id}
    `;
    if (!row) throw new HttpError(404, "Event not found");
    return row as Event;
  };

  /** 404s unless the user organises the event and moderators haven't removed it. */
  const ownEvent = async (me: string, id: string) => {
    const [row] = await asUser(db, me, (tx) => tx`
      select 1 from public.events where id = ${id} and organiser_id = ${me} and status <> 'removed'
    `);
    if (!row) throw new HttpError(404, "Event not found");
  };

  app.post("/events", { schema: { body: createEvent, response: { 201: event } } }, async (request, reply) => {
    const me = request.userId;
    await checkLimit(db, me, "event");
    const b = request.body;
    const created = await asUser(db, me, async (tx) => {
      const [row] = await tx`
        insert into public.events (organiser_id, title, description, starts_at, ends_at, venue_name, location, status)
        values (${me}, ${b.title}, ${b.description ?? null}, ${b.starts_at}, ${b.ends_at ?? null},
                ${b.venue_name ?? null}, ${point(tx, b.lat, b.lng)}, ${b.publish ? "published" : "draft"})
        returning id
      `;
      if (!row) throw new Error("insert returned no row");
      return loadEvent(tx, me, row.id as string);
    });
    return reply.status(201).send(created);
  });

  app.get("/events/nearby", {
    schema: {
      querystring: nearbyQuery,
      response: { 200: z.object({ events: z.array(nearbyEvent), next_cursor: z.string().nullable() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const q = request.query;
    const from = q.from ?? new Date().toISOString();
    const to = q.to ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    if (Date.parse(to) <= Date.parse(from)) throw new HttpError(400, "to must be after from");
    const after = q.cursor ? decodeCursor(q.cursor) : null;

    const rows = await asUser(db, me, async (tx) => {
      const here = point(tx, q.lat, q.lng);
      return tx`
        select ${eventSelect(tx, me, mediaBaseUrl)},
               extensions.st_distance(e.location, ${here})::int as distance_m
        from public.events e join public.profiles p on p.id = e.organiser_id
        where e.status = 'published'
          and extensions.st_dwithin(e.location, ${here}, ${q.radius_km * 1000})
          -- Still going on, or starting within the window.
          and coalesce(e.ends_at, e.starts_at + interval '6 hours') >= ${from}::timestamptz
          and e.starts_at < ${to}::timestamptz
          and not exists (select 1 from public.blocks b where b.blocker_id = ${me} and b.blocked_id = e.organiser_id)
          ${after ? tx`and (e.starts_at, e.id) > (${after.startsAt}::timestamptz, ${after.id}::uuid)` : tx``}
        order by e.starts_at, e.id
        limit ${q.limit + 1}
      `;
    });

    const events = rows.slice(0, q.limit) as z.infer<typeof nearbyEvent>[];
    const last = events.at(-1);
    return { events, next_cursor: rows.length > q.limit && last ? encodeCursor(last) : null };
  });

  app.get("/me/events", {
    schema: {
      querystring: z.object({ role: z.enum(["organising", "going"]).default("going") }),
      response: { 200: z.array(event) },
    },
  }, async (request) => {
    const me = request.userId;
    const rows = await asUser(db, me, (tx) => tx`
      select ${eventSelect(tx, me, mediaBaseUrl)}
      from public.events e join public.profiles p on p.id = e.organiser_id
      where ${request.query.role === "organising"
        ? tx`e.organiser_id = ${me}`
        : tx`exists (select 1 from public.rsvps r where r.event_id = e.id and r.user_id = ${me})`}
        and e.status <> 'removed'
      order by e.starts_at desc
      limit 100
    `);
    return rows as unknown as Event[];
  });

  /** Bookmarks a party. Only the user sees what they saved. */
  app.put("/events/:id/save", { schema: { params: eventParams, response: noContent } }, async (request, reply) => {
    const me = request.userId;
    await asUser(db, me, async (tx) => {
      const [visible] = await tx`select 1 from public.events where id = ${request.params.id}`;
      if (!visible) throw new HttpError(404, "Event not found");
      await tx`insert into public.saved_events (user_id, event_id) values (${me}, ${request.params.id}) on conflict do nothing`;
    });
    return reply.status(204).send(null);
  });

  app.delete("/events/:id/save", { schema: { params: eventParams, response: noContent } }, async (request, reply) => {
    await asUser(db, request.userId, (tx) => tx`
      delete from public.saved_events where event_id = ${request.params.id} and user_id = ${request.userId}
    `);
    return reply.status(204).send(null);
  });

  /** Saved parties, most recently saved first, cancelled ones included so the user sees they're off. */
  app.get("/me/saved/events", { schema: { response: { 200: z.object({ events: z.array(event) }) } } }, async (request) => {
    const me = request.userId;
    const rows = await asUser(db, me, (tx) => tx`
      select ${eventSelect(tx, me, mediaBaseUrl)}
      from public.saved_events s
      join public.events e on e.id = s.event_id
      join public.profiles p on p.id = e.organiser_id
      where s.user_id = ${me} and e.status in ('published', 'cancelled')
        and not exists (select 1 from public.blocks b where b.blocker_id = ${me} and b.blocked_id = e.organiser_id)
      order by s.created_at desc
      limit 200
    `);
    return { events: rows as unknown as Event[] };
  });

  app.get("/events/:id", { schema: { params: eventParams, response: { 200: event } } }, (request) =>
    asUser(db, request.userId, (tx) => loadEvent(tx, request.userId, request.params.id)),
  );

  app.patch("/events/:id", {
    schema: { params: eventParams, body: updateEvent, response: { 200: event } },
  }, (request) => {
    const me = request.userId;
    const { lat: latitude, lng: longitude, ...fields } = request.body;
    // Clearing a box in the app sends an empty string; store that as "no value".
    if (fields.description === "") fields.description = null;
    if (fields.venue_name === "") fields.venue_name = null;
    return asUser(db, me, async (tx) => {
      const [current] = await tx`
        select starts_at, ends_at from public.events where id = ${request.params.id} and organiser_id = ${me}
      `;
      if (!current) throw new HttpError(404, "Event not found");
      // Check the times against what is already stored when only one changes.
      const startsAt = fields.starts_at ?? (current.starts_at as Date).toISOString();
      const endsAt = fields.ends_at !== undefined ? fields.ends_at : (current.ends_at as Date | null)?.toISOString();
      if (!checkTimes({ starts_at: startsAt, ends_at: endsAt })) throw new HttpError(400, timesMessage.message);

      const columns = Object.keys(fields) as (keyof typeof fields)[];
      if (columns.length > 0) {
        await tx`
          update public.events set ${tx(fields, columns)}
          where id = ${request.params.id} and organiser_id = ${me}
        `;
      }
      if (latitude !== undefined && longitude !== undefined) {
        await tx`
          update public.events set location = ${point(tx, latitude, longitude)}
          where id = ${request.params.id} and organiser_id = ${me}
        `;
      }
      return loadEvent(tx, me, request.params.id);
    });
  });

  app.delete("/events/:id", { schema: { params: eventParams, response: noContent } }, async (request, reply) => {
    const me = request.userId;
    const deleted = await asUser(db, me, (tx) => tx`
      delete from public.events where id = ${request.params.id} and organiser_id = ${me} returning id
    `);
    if (deleted.length === 0) throw new HttpError(404, "Event not found");
    return reply.status(204).send(null);
  });

  /** Sets an uploaded photo as the party's cover once the worker has checked it. Organiser only. */
  app.put("/events/:id/cover", {
    schema: { params: eventParams, body: z.object({ upload_id: z.guid() }).strict(), response: { 202: z.null() } },
  }, async (request, reply) => {
    const me = request.userId;
    await ownEvent(me, request.params.id);
    await queuePicture(db, me, request.body.upload_id, { kind: "cover", target_id: request.params.id });
    return reply.status(202).send(null);
  });

  app.delete("/events/:id/cover", { schema: { params: eventParams, response: noContent } }, async (request, reply) => {
    await ownEvent(request.userId, request.params.id);
    await clearPicture(db, { kind: "cover", target_id: request.params.id });
    return reply.status(204).send(null);
  });

  app.put("/events/:id/rsvp", {
    schema: {
      params: eventParams,
      body: z.object({ status: z.enum(["going", "interested"]) }).strict(),
      response: { 200: event },
    },
  }, (request) => {
    const me = request.userId;
    return asUser(db, me, async (tx) => {
      const [visible] = await tx`select status from public.events where id = ${request.params.id}`;
      if (!visible) throw new HttpError(404, "Event not found");
      if (visible.status !== "published") throw new HttpError(409, "This event is not open for RSVPs");
      await tx`
        insert into public.rsvps (event_id, user_id, status)
        values (${request.params.id}, ${me}, ${request.body.status})
        on conflict (event_id, user_id) do update set status = excluded.status
      `;
      return loadEvent(tx, me, request.params.id);
    });
  });

  app.delete("/events/:id/rsvp", { schema: { params: eventParams, response: noContent } }, async (request, reply) => {
    await asUser(db, request.userId, (tx) => tx`
      delete from public.rsvps where event_id = ${request.params.id} and user_id = ${request.userId}
    `);
    return reply.status(204).send(null);
  });
};
