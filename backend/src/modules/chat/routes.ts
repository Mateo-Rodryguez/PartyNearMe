import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db, type Tx } from "../../db.js";
import { HttpError } from "../../errors.js";
import { checkLimit } from "../../limits.js";
import { pictureUrl } from "../media.js";

const person = z.object({
  id: z.guid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

// Message ids are bigints; sent as strings so no client loses precision.
const message = z.object({
  id: z.string(),
  conversation_id: z.guid(),
  sender_id: z.guid(),
  body: z.string(),
  /** Set for party invites: the app shows the party as a card. */
  event_id: z.guid().nullable(),
  created_at: z.date(),
});

const conversation = z.object({
  id: z.guid(),
  /** The other person in a one-to-one chat; null in a party's group chat. */
  other: person.nullable(),
  /** Set for a party's group chat. */
  party: z.object({ id: z.guid(), title: z.string(), cover_url: z.string().nullable() }).nullable(),
  /** Everyone in a party chat (empty for one-to-one chats), for names on messages. */
  members: z.array(person),
  /** People you blocked who are in this party chat; the app hides their live messages too. */
  hidden_sender_ids: z.array(z.guid()),
  last_message: message.nullable(),
  unread_count: z.number().int(),
  last_message_at: z.date().nullable(),
});
type Conversation = z.infer<typeof conversation>;

const conversationParams = z.object({ id: z.guid() });

/** People one party invite can go to at once. */
const MAX_INVITES = 20;

const encodeCursor = (c: { last_message_at: Date; id: string }) =>
  Buffer.from(`${c.last_message_at.toISOString()}|${c.id}`).toString("base64url");
const decodeCursor = (cursor: string) => {
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!at || !id || Number.isNaN(Date.parse(at)) || !z.guid().safeParse(id).success) {
    throw new HttpError(400, "Invalid cursor");
  }
  return { at, id };
};

/** Most people a party chat lists as members. */
const MAX_MEMBERS = 500;

/**
 * Whether message m is shown: in party chats, messages from people the user
 * blocked are left out (blocks are only readable by the person who made them,
 * so this is the user's own list). One-to-one chats stop new messages instead.
 */
const shown = (tx: Tx, c: string, m: string) => tx`
  (${tx(c)}.event_id is null or not exists (select 1 from public.blocks b where b.blocked_id = ${tx(m)}.sender_id))
`;

const personJson = (tx: Tx, base: string | undefined) => tx`
  json_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                    'avatar_url', ${pictureUrl(tx, base, "p.avatar_variants", "150")})
`;

/** Inbox rows; RLS limits them to conversations the user is in. */
const conversationSelect = (tx: Tx, me: string, base: string | undefined) => tx`
  c.id, c.last_message_at,
  case when c.event_id is null then
    (select ${personJson(tx, base)}
     from public.conversation_members om join public.profiles p on p.id = om.user_id
     where om.conversation_id = c.id and om.user_id <> ${me}
     limit 1)
  end as other,
  (select json_build_object('id', e.id, 'title', e.title, 'cover_url', ${pictureUrl(tx, base, "e.cover_variants", "150")})
   from public.events e where e.id = c.event_id) as party,
  case when c.event_id is null then '[]'::json else coalesce((
    select json_agg(${personJson(tx, base)} order by p.username)
    from (select user_id from public.conversation_members where conversation_id = c.id limit ${MAX_MEMBERS}) om
    join public.profiles p on p.id = om.user_id
  ), '[]'::json) end as members,
  case when c.event_id is null then '[]'::json else coalesce((
    select json_agg(b.blocked_id)
    from public.blocks b join public.conversation_members om on om.user_id = b.blocked_id and om.conversation_id = c.id
  ), '[]'::json) end as hidden_sender_ids,
  (select json_build_object('id', m.id::text, 'conversation_id', m.conversation_id, 'sender_id', m.sender_id,
                            'body', m.body, 'event_id', m.event_id, 'created_at', m.created_at)
   from public.messages m where m.conversation_id = c.id and ${shown(tx, "c", "m")}
   order by m.id desc limit 1) as last_message,
  (select count(*)::int from public.messages m
   where m.conversation_id = c.id and m.sender_id <> ${me} and ${shown(tx, "c", "m")}
     and m.created_at > coalesce(me.last_read_at, '-infinity')) as unread_count
`;

type ConversationRow = Omit<Conversation, "last_message"> & {
  last_message: (Omit<z.infer<typeof message>, "created_at"> & { created_at: string }) | null;
};
const toConversation = (row: ConversationRow): Conversation => ({
  ...row,
  last_message: row.last_message ? { ...row.last_message, created_at: new Date(row.last_message.created_at) } : null,
});

export const chatRoutes: FastifyPluginAsyncZod<{ db: Db; mediaBaseUrl: string | undefined }> = async (
  app,
  { db, mediaBaseUrl },
) => {
  const loadConversation = async (tx: Tx, me: string, id: string) => {
    const [row] = await tx`
      select ${conversationSelect(tx, me, mediaBaseUrl)}
      from public.conversations c
      join public.conversation_members me on me.conversation_id = c.id and me.user_id = ${me}
      where c.id = ${id}
    `;
    if (!row) throw new HttpError(404, "Conversation not found");
    return toConversation(row as unknown as ConversationRow);
  };

  /** Opens (or creates) the one-to-one chat with another user. */
  app.post("/conversations", {
    schema: { body: z.object({ user_id: z.guid() }).strict(), response: { 200: conversation } },
  }, (request) => {
    const me = request.userId;
    return asUser(db, me, async (tx) => {
      const [row] = await tx<{ id: string }[]>`select public.start_direct_conversation(${request.body.user_id}) as id`;
      if (!row) throw new Error("start_direct_conversation returned no row");
      return loadConversation(tx, me, row.id);
    });
  });

  /** The inbox, most recent first. Chats with no messages yet are left out. */
  app.get("/conversations", {
    schema: {
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.string().max(200).optional(),
      }),
      response: { 200: z.object({ conversations: z.array(conversation), next_cursor: z.string().nullable() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const { limit, cursor } = request.query;
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await asUser(db, me, (tx) => tx`
      select ${conversationSelect(tx, me, mediaBaseUrl)}
      from public.conversations c
      join public.conversation_members me on me.conversation_id = c.id and me.user_id = ${me}
      where c.last_message_at is not null
        ${after ? tx`and (c.last_message_at, c.id) < (${after.at}::timestamptz, ${after.id}::uuid)` : tx``}
      order by c.last_message_at desc, c.id desc
      limit ${limit + 1}
    `);
    const conversations = (rows.slice(0, limit) as unknown as ConversationRow[]).map(toConversation);
    const last = conversations.at(-1);
    return {
      conversations,
      next_cursor: rows.length > limit && last?.last_message_at
        ? encodeCursor({ last_message_at: last.last_message_at, id: last.id })
        : null,
    };
  });

  /** Total unread messages, for the app's badge. */
  app.get("/conversations/unread", {
    schema: { response: { 200: z.object({ unread_count: z.number().int() }) } },
  }, async (request) => {
    const me = request.userId;
    const [row] = await asUser(db, me, (tx) => tx<{ n: number }[]>`
      select count(*)::int as n
      from public.conversation_members me
      join public.conversations c on c.id = me.conversation_id
      join public.messages m on m.conversation_id = me.conversation_id
      where me.user_id = ${me} and m.sender_id <> ${me} and ${shown(tx, "c", "m")}
        and m.created_at > coalesce(me.last_read_at, '-infinity')
    `);
    return { unread_count: row?.n ?? 0 };
  });

  app.get("/conversations/:id", {
    schema: { params: conversationParams, response: { 200: conversation } },
  }, (request) => asUser(db, request.userId, (tx) => loadConversation(tx, request.userId, request.params.id)));

  /** History, newest first; pass the oldest id you have as `before` to load more. */
  app.get("/conversations/:id/messages", {
    schema: {
      params: conversationParams,
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        before: z.string().regex(/^\d{1,19}$/).optional(),
      }),
      response: { 200: z.object({ messages: z.array(message), has_more: z.boolean() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const { limit, before } = request.query;
    return asUser(db, me, async (tx) => {
      await loadConversation(tx, me, request.params.id);
      const rows = await tx<z.infer<typeof message>[]>`
        select m.id::text, m.conversation_id, m.sender_id, m.body, m.event_id, m.created_at
        from public.messages m join public.conversations c on c.id = m.conversation_id
        where m.conversation_id = ${request.params.id} and ${shown(tx, "c", "m")}
          ${before ? tx`and m.id < ${before}::bigint` : tx``}
        -- The table's id, not the text copy in the select list, which would sort "10" before "9".
        order by m.id desc
        limit ${limit + 1}
      `;
      return { messages: rows.slice(0, limit), has_more: rows.length > limit };
    });
  });

  app.post("/conversations/:id/messages", {
    schema: {
      params: conversationParams,
      body: z.object({ body: z.string().trim().min(1).max(4000) }).strict(),
      response: { 201: message },
    },
  }, async (request, reply) => {
    const me = request.userId;
    await checkLimit(db, me, "message");
    const sent = await asUser(db, me, async (tx) => {
      await loadConversation(tx, me, request.params.id);
      const [row] = await tx<z.infer<typeof message>[]>`
        insert into public.messages (conversation_id, sender_id, body)
        values (${request.params.id}, ${me}, ${request.body.body})
        returning id::text, conversation_id, sender_id, body, event_id, created_at
      `;
      if (!row) throw new Error("insert returned no row");
      return row;
    });
    return reply.status(201).send(sent);
  });

  /**
   * Invites people to a party: each gets a chat message that points at it, which
   * the app shows as a card. People who can't be messaged (blocks, "only people I
   * follow") are skipped rather than failing the rest.
   */
  app.post("/events/:id/invites", {
    schema: {
      params: z.object({ id: z.guid() }),
      body: z.object({
        user_ids: z.array(z.guid()).min(1).max(MAX_INVITES).refine((ids) => new Set(ids).size === ids.length, "Duplicate person"),
      }).strict(),
      response: { 200: z.object({ sent: z.number().int(), skipped: z.number().int() }) },
    },
  }, async (request) => {
    const me = request.userId;
    const [party] = await asUser(db, me, (tx) => tx<{ title: string }[]>`
      select title from public.events where id = ${request.params.id} and status = 'published'
    `);
    if (!party) throw new HttpError(404, "Event not found");
    await checkLimit(db, me, "message");
    let sent = 0;
    for (const userId of request.body.user_ids) {
      if (userId === me) continue;
      try {
        await asUser(db, me, async (tx) => {
          const [row] = await tx<{ id: string }[]>`select public.start_direct_conversation(${userId}) as id`;
          await tx`
            insert into public.messages (conversation_id, sender_id, body, event_id)
            values (${row?.id ?? null}, ${me}, ${`You're invited to ${party.title}`}, ${request.params.id})
          `;
        });
        sent++;
      } catch (err) {
        // Not allowed or no such person: skip them. Anything else is a real failure.
        if (!["42501", "PN403", "P0002", "22023"].includes((err as { code?: string }).code ?? "")) throw err;
      }
    }
    return { sent, skipped: request.body.user_ids.length - sent };
  });

  /** Marks everything up to now as read. */
  app.post("/conversations/:id/read", {
    schema: { params: conversationParams, response: { 204: z.null() } },
  }, async (request, reply) => {
    const me = request.userId;
    const updated = await asUser(db, me, (tx) => tx`
      update public.conversation_members set last_read_at = now()
      where conversation_id = ${request.params.id} and user_id = ${me}
      returning conversation_id
    `);
    if (updated.length === 0) throw new HttpError(404, "Conversation not found");
    return reply.status(204).send(null);
  });

  /** Registers this phone for push. A token follows whoever signed in on it last. */
  app.put("/devices/:token", {
    schema: {
      params: z.object({ token: z.string().min(10).max(4096) }),
      body: z.object({ platform: z.enum(["android", "ios"]) }).strict(),
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    // Runs as the owner: the token may still belong to the previous user of this phone.
    await db`
      insert into public.device_tokens (token, user_id, platform)
      values (${request.params.token}, ${request.userId}, ${request.body.platform})
      on conflict (token) do update
        set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()
    `;
    return reply.status(204).send(null);
  });

  /** Call on sign-out so the phone stops getting this user's notifications. */
  app.delete("/devices/:token", {
    schema: { params: z.object({ token: z.string().min(1).max(4096) }), response: { 204: z.null() } },
  }, async (request, reply) => {
    await asUser(db, request.userId, (tx) => tx`
      delete from public.device_tokens where token = ${request.params.token} and user_id = ${request.userId}
    `);
    return reply.status(204).send(null);
  });
};
