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
