import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

async function upload(userId: string, contentType = "image/jpeg", size = 1000) {
  const res = await ctx.as(userId, {
    method: "POST",
    url: "/uploads",
    payload: { content_type: contentType, size_bytes: size },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { upload_id: string; upload_url: string; headers: Record<string, string> };
}

async function createPost(userId: string, overrides: Record<string, unknown> = {}) {
  const uploads = [await upload(userId), await upload(userId)];
  const res = await ctx.as(userId, {
    method: "POST",
    url: "/posts",
    payload: { upload_ids: uploads.map((u) => u.upload_id), caption: "hello", ...overrides },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; [k: string]: unknown };
}

/** Stands in for the worker approving a post. */
const approve = (postId: string) =>
  ctx.db`update public.posts set status = 'visible' where id = ${postId}`;

describe("POST /uploads", () => {
  it("returns a signed upload URL under the user's own prefix", async () => {
    const alice = await ctx.createUser();
    const u = await upload(alice, "image/webp", 4321);
    expect(new URL(u.upload_url).pathname).toMatch(new RegExp(`/uploads/${alice}/[0-9a-f-]+\\.webp$`));
    expect(u.headers).toEqual({ "content-type": "image/webp", "content-length": "4321" });
  });

  it("rejects other file types and oversized files", async () => {
    const alice = await ctx.createUser();
    for (const payload of [
      { content_type: "application/pdf", size_bytes: 10 },
      { content_type: "image/jpeg", size_bytes: 16 * 1024 * 1024 },
      { content_type: "image/jpeg", size_bytes: 0 },
    ]) {
      const res = await ctx.as(alice, { method: "POST", url: "/uploads", payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });
});

describe("posts", () => {
  it("creates a pending post that only the author sees, without image URLs", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const p = await createPost(alice, { lat: 51.5, lng: -0.12, place_name: "London" });
    expect(p).toMatchObject({ status: "pending", caption: "hello", author: { id: alice }, place_name: "London" });
    expect(p.media).toHaveLength(2);
    expect((p.media as { url: string | null }[])[0]?.url).toBeNull();

    expect((await ctx.as(bob, { method: "GET", url: `/posts/${p.id}` })).statusCode).toBe(404);
    const bobList = await ctx.as(bob, { method: "GET", url: `/users/${alice}/posts` });
    expect(bobList.json().posts).toEqual([]);
  });

  it("shows approved posts to everyone, with media URLs", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const p = await createPost(alice);
    await approve(p.id);
    const res = await ctx.as(bob, { method: "GET", url: `/posts/${p.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().media[0].url).toMatch(/^https:\/\/media\.test\/uploads\//);
  });

  it("won't reuse an upload or use someone else's", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const u = await upload(alice);
    const first = await ctx.as(alice, { method: "POST", url: "/posts", payload: { upload_ids: [u.upload_id] } });
    expect(first.statusCode).toBe(201);
    const again = await ctx.as(alice, { method: "POST", url: "/posts", payload: { upload_ids: [u.upload_id] } });
    expect(again.statusCode).toBe(404);

    const v = await upload(alice);
    const stolen = await ctx.as(bob, { method: "POST", url: "/posts", payload: { upload_ids: [v.upload_id] } });
    expect(stolen.statusCode).toBe(404);
  });

  it("attaches a post to a visible event only", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const draft = await ctx.as(alice, {
      method: "POST",
      url: "/events",
      payload: { title: "Secret", starts_at: new Date(Date.now() + 86400000).toISOString(), lat: 0, lng: 0 },
    });
    const u = await upload(bob);
    const res = await ctx.as(bob, {
      method: "POST",
      url: "/posts",
      payload: { upload_ids: [u.upload_id], event_id: draft.json().id },
    });
    expect(res.statusCode).toBe(404);
  });

  it("lets only the author edit or delete", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const p = await createPost(alice);
    await approve(p.id);

    expect((await ctx.as(bob, { method: "PATCH", url: `/posts/${p.id}`, payload: { caption: "x" } })).statusCode).toBe(404);
    expect((await ctx.as(bob, { method: "DELETE", url: `/posts/${p.id}` })).statusCode).toBe(404);

    const edited = await ctx.as(alice, { method: "PATCH", url: `/posts/${p.id}`, payload: { caption: "new" } });
    expect(edited.json()).toMatchObject({ caption: "new", status: "visible" });

    expect((await ctx.as(alice, { method: "DELETE", url: `/posts/${p.id}` })).statusCode).toBe(204);
    const [queued] = await ctx.db`select count(*)::int as n from public.outbox where topic = 'media.deleted'`;
    expect(queued?.n).toBe(2);
  });

  it("pages a user's posts newest first", async () => {
    const alice = await ctx.createUser();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.unshift((await createPost(alice)).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await ctx.as(alice, {
        method: "GET",
        url: `/users/${alice}/posts?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
      });
      seen.push(...res.json().posts.map((p: { id: string }) => p.id));
      cursor = res.json().next_cursor;
    } while (cursor);
    expect(seen).toEqual(ids);
  });
});

describe("likes", () => {
  it("likes and unlikes visible posts, idempotently", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const p = await createPost(alice);
    expect((await ctx.as(bob, { method: "PUT", url: `/posts/${p.id}/like` })).statusCode).toBe(404);

    await approve(p.id);
    await ctx.as(bob, { method: "PUT", url: `/posts/${p.id}/like` });
    await ctx.as(bob, { method: "PUT", url: `/posts/${p.id}/like` });
    const liked = await ctx.as(bob, { method: "GET", url: `/posts/${p.id}` });
    expect(liked.json()).toMatchObject({ like_count: 1, liked_by_me: true });

    await ctx.as(bob, { method: "DELETE", url: `/posts/${p.id}/like` });
    const unliked = await ctx.as(bob, { method: "GET", url: `/posts/${p.id}` });
    expect(unliked.json()).toMatchObject({ like_count: 0, liked_by_me: false });
  });
});
