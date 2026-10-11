import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

async function open(me: string, other: string) {
  const res = await ctx.as(me, { method: "POST", url: "/conversations", payload: { user_id: other } });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { id: string };
}
const send = (me: string, conversationId: string, body: string) =>
  ctx.as(me, { method: "POST", url: `/conversations/${conversationId}/messages`, payload: { body } });
const inbox = async (me: string, query = "") =>
  (await ctx.as(me, { method: "GET", url: `/conversations${query}` })).json() as {
    conversations: { id: string; other: { id: string }; unread_count: number; last_message: { body: string } | null }[];
    next_cursor: string | null;
  };

describe("conversations", () => {
  it("opens one chat per pair, from either side", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const a = await open(alice, bob);
    const b = await open(bob, alice);
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ other: { id: bob }, last_message: null, unread_count: 0 });
  });

  it("refuses chats with yourself, unknown users and people who blocked you", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await ctx.as(bob, { method: "PUT", url: `/users/${alice}/block` });
    const post = (userId: string) => ctx.as(alice, { method: "POST", url: "/conversations", payload: { user_id: userId } });
    expect((await post(alice)).statusCode).toBe(400);
    expect((await post("00000000-0000-0000-0000-000000000099")).statusCode).toBe(404);
    expect((await post(bob)).statusCode).toBe(403);
  });

  it("sends messages and keeps the inbox and unread counts right", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const carol = await ctx.createUser();
    const ab = await open(alice, bob);
    const cb = await open(carol, bob);

    const sent = await send(alice, ab.id, "  hi bob  ");
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json()).toMatchObject({ body: "hi bob", sender_id: alice, conversation_id: ab.id });
    await send(alice, ab.id, "you there?");
    await send(carol, cb.id, "party tonight");

    const bobs = await inbox(bob);
    expect(bobs.conversations.map((c) => [c.other.id, c.unread_count, c.last_message?.body])).toEqual([
      [carol, 1, "party tonight"],
      [alice, 2, "you there?"],
    ]);
    expect((await ctx.as(bob, { method: "GET", url: "/conversations/unread" })).json()).toEqual({ unread_count: 3 });
    // Your own messages never count as unread.
    expect((await inbox(alice)).conversations[0]?.unread_count).toBe(0);

    expect((await ctx.as(bob, { method: "POST", url: `/conversations/${ab.id}/read` })).statusCode).toBe(204);
    expect((await ctx.as(bob, { method: "GET", url: "/conversations/unread" })).json()).toEqual({ unread_count: 1 });
  });

  it("leaves empty chats out of the inbox and pages the rest", async () => {
    const me = await ctx.createUser();
    const others = [];
    for (let i = 0; i < 3; i++) {
      const other = await ctx.createUser();
      const c = await open(other, me);
      await send(other, c.id, `msg ${i}`);
      others.push(other);
    }
    await open(me, await ctx.createUser()); // no messages

    const first = await inbox(me, "?limit=2");
    expect(first.conversations.map((c) => c.other.id)).toEqual([others[2], others[1]]);
    const second = await inbox(me, `?limit=2&cursor=${first.next_cursor}`);
    expect(second.conversations.map((c) => c.other.id)).toEqual([others[0]]);
    expect(second.next_cursor).toBeNull();
  });

  it("pages history from newest to oldest", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const c = await open(alice, bob);
    for (let i = 0; i < 5; i++) await send(i % 2 ? bob : alice, c.id, `m${i}`);

    const page = async (query: string) =>
      (await ctx.as(bob, { method: "GET", url: `/conversations/${c.id}/messages${query}` })).json() as {
        messages: { id: string; body: string }[];
        has_more: boolean;
      };
    const first = await page("?limit=3");
    expect(first.messages.map((m) => m.body)).toEqual(["m4", "m3", "m2"]);
    expect(first.has_more).toBe(true);
    const second = await page(`?limit=3&before=${first.messages.at(-1)?.id}`);
    expect(second.messages.map((m) => m.body)).toEqual(["m1", "m0"]);
    expect(second.has_more).toBe(false);
  });

  it("keeps outsiders out", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const eve = await ctx.createUser();
    const c = await open(alice, bob);
    await send(alice, c.id, "secret");

    expect((await ctx.as(eve, { method: "GET", url: `/conversations/${c.id}` })).statusCode).toBe(404);
    expect((await ctx.as(eve, { method: "GET", url: `/conversations/${c.id}/messages` })).statusCode).toBe(404);
    expect((await send(eve, c.id, "let me in")).statusCode).toBe(404);
    expect((await ctx.as(eve, { method: "POST", url: `/conversations/${c.id}/read` })).statusCode).toBe(404);
    expect((await inbox(eve)).conversations).toEqual([]);
  });

  it("stops messages once either person blocks the other", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const c = await open(alice, bob);
    expect((await send(alice, c.id, "hi")).statusCode).toBe(201);
    await ctx.as(bob, { method: "PUT", url: `/users/${alice}/block` });
    expect((await send(alice, c.id, "hello?")).statusCode).toBe(403);
    expect((await send(bob, c.id, "go away")).statusCode).toBe(403);
  });

  it("validates message bodies", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const c = await open(alice, bob);
    for (const body of ["", "   ", "x".repeat(4001)]) {
      expect((await send(alice, c.id, body)).statusCode).toBe(400);
    }
  });
});

describe("devices", () => {
  const token = "fcm-token-abcdef-123";
  const devices = () => ctx.db<{ user_id: string; platform: string }[]>`select user_id, platform from public.device_tokens`;

  it("registers a phone and moves it to whoever signs in next", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const put = (userId: string, platform: string) =>
      ctx.as(userId, { method: "PUT", url: `/devices/${token}`, payload: { platform } });

    expect((await put(alice, "android")).statusCode).toBe(204);
    expect((await put(alice, "android")).statusCode).toBe(204);
    expect(await devices()).toEqual([{ user_id: alice, platform: "android" }]);

    await put(bob, "android");
    expect(await devices()).toEqual([{ user_id: bob, platform: "android" }]);
    expect((await put(bob, "windows")).statusCode).toBe(400);
  });

  it("only lets the owner remove a token", async () => {
    const alice = await ctx.createUser();
    const eve = await ctx.createUser();
    await ctx.as(alice, { method: "PUT", url: `/devices/${token}`, payload: { platform: "ios" } });
    await ctx.as(eve, { method: "DELETE", url: `/devices/${token}` });
    expect(await devices()).toHaveLength(1);
    await ctx.as(alice, { method: "DELETE", url: `/devices/${token}` });
    expect(await devices()).toHaveLength(0);
  });
});
