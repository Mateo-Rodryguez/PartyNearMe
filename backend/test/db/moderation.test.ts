import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

async function upload(userId: string) {
  const res = await ctx.as(userId, { method: "POST", url: "/uploads", payload: { content_type: "image/jpeg", size_bytes: 1000 } });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { upload_id: string }).upload_id;
}

async function visiblePost(userId: string) {
  const res = await ctx.as(userId, { method: "POST", url: "/posts", payload: { upload_ids: [await upload(userId)], caption: "hi" } });
  expect(res.statusCode, res.body).toBe(201);
  const { id } = res.json() as { id: string };
  await ctx.db`update public.posts set status = 'visible' where id = ${id}`;
  return id;
}

const report = (userId: string, payload: Record<string, unknown>) =>
  ctx.as(userId, { method: "POST", url: "/reports", payload });

describe("POST /reports", () => {
  it("files a report as the signed-in user", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const res = await report(alice, { target_type: "user", target_id: bob, reason: "Spam", reporter_id: bob });
    expect(res.statusCode).toBe(400); // extra fields are refused, so nobody can report as someone else
    expect((await report(alice, { target_type: "user", target_id: bob, reason: "Spam" })).statusCode).toBe(204);
    const rows = await ctx.db`select reporter_id, target_type, target_id, reason, status from public.reports`;
    expect(rows).toEqual([{ reporter_id: alice, target_type: "user", target_id: bob, reason: "Spam", status: "open" }]);
  });

  it("only takes reports of messages from your own chats", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const eve = await ctx.createUser();
    const chat = (await ctx.as(alice, { method: "POST", url: "/conversations", payload: { user_id: bob } })).json().id as string;
    const sent = await ctx.as(alice, { method: "POST", url: `/conversations/${chat}/messages`, payload: { body: "rude" } });
    const id = sent.json().id as string;

    expect((await report(eve, { target_type: "message", target_id: id, reason: "Harassment" })).statusCode).toBe(404);
    expect((await report(bob, { target_type: "message", target_id: "abc", reason: "Harassment" })).statusCode).toBe(404);
    expect((await report(bob, { target_type: "message", target_id: id, reason: "Harassment" })).statusCode).toBe(204);
  });

  it("validates input", async () => {
    const alice = await ctx.createUser();
    expect((await report(alice, { target_type: "planet", target_id: "x", reason: "Spam" })).statusCode).toBe(400);
    expect((await report(alice, { target_type: "post", target_id: "x", reason: "   " })).statusCode).toBe(400);
  });

  it("hides a post once three different people report it", async () => {
    const author = await ctx.createUser();
    const post = await visiblePost(author);
    const carol = await ctx.createUser();
    const dave = await ctx.createUser();
    const erin = await ctx.createUser();
    const status = async () => (await ctx.db`select status from public.posts where id = ${post}`)[0]?.status;

    await report(carol, { target_type: "post", target_id: post, reason: "Offensive" });
    await report(carol, { target_type: "post", target_id: post, reason: "Offensive" });
    await report(dave, { target_type: "post", target_id: post, reason: "Offensive" });
    expect(await status()).toBe("visible"); // the same person twice counts once

    await report(erin, { target_type: "post", target_id: post, reason: "Offensive" });
    expect(await status()).toBe("hidden");
  });
});

describe("DELETE /me", () => {
  it("deletes the account and what it made, and queues its photos for deletion", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await visiblePost(alice);
    await upload(alice); // uploaded but never posted
    await ctx.as(alice, { method: "PUT", url: `/users/${bob}/follow` });
    await ctx.db`truncate public.outbox`;

    const res = await ctx.as(alice, { method: "DELETE", url: "/me" });
    expect(res.statusCode).toBe(204);

    for (const [table, column] of [["profiles", "id"], ["posts", "author_id"], ["uploads", "user_id"], ["follows", "follower_id"]] as const) {
      const [row] = await ctx.db`select count(*)::int as n from ${ctx.db(`public.${table}`)} where ${ctx.db(column)} = ${alice}`;
      expect(row?.n, table).toBe(0);
    }
    const queued = await ctx.db<{ topic: string; key: string }[]>`
      select topic, payload->>'storage_key' as key from public.outbox order by id
    `;
    expect(queued.map((q) => q.topic)).toEqual(["media.deleted", "media.deleted"]);
    expect(queued.every((q) => q.key.length > 0)).toBe(true);

    // Bob's account is untouched.
    expect((await ctx.as(bob, { method: "GET", url: "/me" })).statusCode).toBe(200);
  });
});

describe("moderator tools", () => {
  const makeModerator = (userId: string) => ctx.db`insert into public.moderators (user_id) values (${userId})`;
  const queue = async (userId: string) => ctx.as(userId, { method: "GET", url: "/moderation/queue" });
  const act = (userId: string, payload: Record<string, unknown>) =>
    ctx.as(userId, { method: "POST", url: "/moderation/actions", payload });

  it("is only for moderators, and /me says who is one", async () => {
    const alice = await ctx.createUser();
    const mod = await ctx.createUser();
    await makeModerator(mod);
    expect((await queue(alice)).statusCode).toBe(403);
    expect((await act(alice, { target_type: "user", target_id: mod, action: "dismiss" })).statusCode).toBe(403);
    expect((await ctx.as(alice, { method: "GET", url: "/me" })).json().is_moderator).toBe(false);
    expect((await ctx.as(mod, { method: "GET", url: "/me" })).json().is_moderator).toBe(true);
  });

  it("lists open reports once per thing, with a preview, including hidden posts", async () => {
    const author = await ctx.createUser();
    const mod = await ctx.createUser();
    await makeModerator(mod);
    const post = await visiblePost(author);
    const carol = await ctx.createUser();
    await report(carol, { target_type: "post", target_id: post, reason: "Spam" });
    await report(mod, { target_type: "post", target_id: post, reason: "Nudity" });
    await report(carol, { target_type: "user", target_id: author, reason: "Fake" });
    // A message deleted after it was reported.
    await ctx.db`insert into public.reports (reporter_id, target_type, target_id, reason) values (${carol}, 'message', '999', 'Rude')`;
    await ctx.db`update public.posts set status = 'hidden' where id = ${post}`;

    const res = await queue(mod);
    expect(res.statusCode, res.body).toBe(200);
    const items = res.json().items as { target_type: string; report_count: number; reasons: string[]; preview: { title: string; body: string; status: string; user_id: string } | null }[];
    expect(items.map((i) => i.target_type)).toEqual(["post", "user", "message"]);
    expect(items[0]).toMatchObject({ report_count: 2, reasons: ["Spam", "Nudity"], preview: { body: "hi", status: "hidden", user_id: author } });
    expect(items[1]?.preview?.user_id).toBe(author);
    expect(items[2]?.preview).toBeNull(); // no such message
  });

  it("removes and restores a post, closes its reports and logs it", async () => {
    const author = await ctx.createUser();
    const mod = await ctx.createUser();
    await makeModerator(mod);
    const post = await visiblePost(author);
    await report(mod, { target_type: "post", target_id: post, reason: "Spam" });

    expect((await act(mod, { target_type: "post", target_id: post, action: "remove", note: "spam link" })).statusCode).toBe(204);
    expect((await ctx.db`select status from public.posts where id = ${post}`)[0]?.status).toBe("removed");
    expect((await ctx.db`select status from public.reports`)[0]?.status).toBe("actioned");
    expect((await queue(mod)).json().items).toEqual([]);

    expect((await act(mod, { target_type: "post", target_id: post, action: "restore" })).statusCode).toBe(204);
    expect((await ctx.db`select status from public.posts where id = ${post}`)[0]?.status).toBe("visible");
    const log = await ctx.db`select moderator_id, action, note from public.moderation_actions order by id`;
    expect(log).toEqual([
      { moderator_id: mod, action: "remove", note: "spam link" },
      { moderator_id: mod, action: "restore", note: null },
    ]);
  });

  it("removes parties and messages, and deletes accounts but not your own", async () => {
    const host = await ctx.createUser();
    const mod = await ctx.createUser();
    await makeModerator(mod);
    const event = await ctx.as(host, {
      method: "POST",
      url: "/events",
      payload: { title: "Party", starts_at: new Date(Date.now() + 86400000).toISOString(), lat: 0, lng: 0, publish: true },
    });
    const eventId = event.json().id as string;
    expect((await act(mod, { target_type: "event", target_id: eventId, action: "remove" })).statusCode).toBe(204);
    expect((await ctx.as(host, { method: "GET", url: `/events/${eventId}` })).json().status).toBe("removed");

    const chat = await ctx.as(host, { method: "POST", url: "/conversations", payload: { user_id: mod } });
    const sent = await ctx.as(host, { method: "POST", url: `/conversations/${chat.json().id}/messages`, payload: { body: "rude" } });
    expect(sent.statusCode, sent.body).toBe(201);
    expect((await act(mod, { target_type: "message", target_id: sent.json().id, action: "remove" })).statusCode).toBe(204);
    expect((await ctx.db`select count(*)::int as n from public.messages`)[0]?.n).toBe(0);

    expect((await act(mod, { target_type: "post", target_id: eventId, action: "delete_account" })).statusCode).toBe(400);
    expect((await act(mod, { target_type: "user", target_id: mod, action: "delete_account" })).statusCode).toBe(400);
    expect((await act(mod, { target_type: "user", target_id: host, action: "delete_account" })).statusCode).toBe(204);
    expect((await ctx.db`select count(*)::int as n from auth.users where id = ${host}`)[0]?.n).toBe(0);
    expect((await act(mod, { target_type: "user", target_id: host, action: "delete_account" })).statusCode).toBe(404);
  });
});
