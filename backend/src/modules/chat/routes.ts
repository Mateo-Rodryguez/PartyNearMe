import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { asUser, type Db, type Tx } from "../../db.js";
import { HttpError } from "../../errors.js";
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
  created_at: z.date(),
});

const conversation = z.object({
  id: z.guid(),
  other: person.nullable(),
  last_message: message.nullable(),
  unread_count: z.number().int(),
  last_message_at: z.date().nullable(),
});
type Conversation = z.infer<typeof conversation>;

const conversationParams = z.object({ id: z.guid() });

const encodeCursor = (c: { last_message_at: Date; id: string }) =>
  Buffer.from(`${c.last_message_at.toISOString()}|${c.id}`).toString("base64url");
const decodeCursor = (cursor: string) => {
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!at || !id || Number.isNaN(Date.parse(at)) || !z.guid().safeParse(id).success) {
    throw new HttpError(400, "Invalid cursor");
  }
  return { at, id };
};

/** Inbox rows; RLS limits them to conversations the user is in. */
const conversationSelect = (tx: Tx, me: string, base: string | undefined) => tx`
  c.id, c.last_message_at,
  (select json_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                            'avatar_url', ${pictureUrl(tx, base, "p.avatar_variants", "150")})
   from public.conversation_members om join public.profiles p on p.id = om.user_id
   where om.conversation_id = c.id and om.user_id <> ${me}
   limit 1) as other,
  (select json_build_object('id', m.id::text, 'conversation_id', m.conversation_id, 'sender_id', m.sender_id,
                            'body', m.body, 'created_at', m.created_at)
   from public.messages m where m.conversation_id = c.id order by m.id desc limit 1) as last_message,
  (select count(*)::int from public.messages m
   where m.conversation_id = c.id and m.sender_id <> ${me}
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
      join public.messages m on m.conversation_id = me.conversation_id
      where me.user_id = ${me} and m.sender_id <> ${me}
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
        select id::text, conversation_id, sender_id, body, created_at
        from public.messages
        where conversation_id = ${request.params.id}
          ${before ? tx`and id < ${before}::bigint` : tx``}
        order by id desc
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
    const sent = await asUser(db, me, async (tx) => {
      await loadConversation(tx, me, request.params.id);
      const [row] = await tx<z.infer<typeof message>[]>`
        insert into public.messages (conversation_id, sender_id, body)
        values (${request.params.id}, ${me}, ${request.body.body})
        returning id::text, conversation_id, sender_id, body, created_at
      `;
      if (!row) throw new Error("insert returned no row");
      return row;
    });
    return reply.status(201).send(sent);
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
