import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

async function visiblePost(authorId: string) {
  const [row] = await ctx.db<{ id: string }[]>`
    insert into public.posts (author_id, status) values (${authorId}, 'visible') returning id
  `;
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

type Comment = { id: string; body: string; can_delete: boolean; status: string; author: { id: string } };
const comment = (userId: string, postId: string, body: string) =>
  ctx.as(userId, { method: "POST", url: `/posts/${postId}/comments`, payload: { body } });
const list = async (userId: string, postId: string, query = "") =>
  (await ctx.as(userId, { method: "GET", url: `/posts/${postId}/comments${query}` })).json() as {
    comments: Comment[];
    next_cursor: string | null;
  };
const commentCount = async (userId: string, postId: string) =>
  ((await ctx.as(userId, { method: "GET", url: `/posts/${postId}` })).json() as { comment_count: number }).comment_count;

describe("comments", () => {
  it("adds comments newest first, keeps the count in step, and pages", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const post = await visiblePost(alice);
    const first = await comment(bob, post, "  first!  ");
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ body: "first!", can_delete: true, author: { id: bob } });
    await comment(alice, post, "thanks");
    await comment(bob, post, "third");

    expect(await commentCount(bob, post)).toBe(3);
    const page = await list(bob, post, "?limit=2");
    expect(page.comments.map((c) => c.body)).toEqual(["third", "thanks"]);
    // Bob can delete his own comment but not Alice's.
    expect(page.comments.map((c) => c.can_delete)).toEqual([true, false]);
    const rest = await list(bob, post, `?limit=2&cursor=${page.next_cursor}`);
    expect(rest.comments.map((c) => c.body)).toEqual(["first!"]);
    expect(rest.next_cursor).toBeNull();
    // The post's author can delete anyone's comment on it.
    expect((await list(alice, post)).comments.every((c) => c.can_delete)).toBe(true);
  });

  it("refuses empty or overlong comments", async () => {
    const alice = await ctx.createUser();
    const post = await visiblePost(alice);
    expect((await comment(alice, post, "   ")).statusCode).toBe(400);
    expect((await comment(alice, post, "x".repeat(1001))).statusCode).toBe(400);
  });

  it("lets the author or the post's author delete a comment, and nobody else", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const carol = await ctx.createUser();
    const post = await visiblePost(alice);
    const bobs = (await comment(bob, post, "hey")).json() as Comment;
    const carols = (await comment(carol, post, "yo")).json() as Comment;

    expect((await ctx.as(carol, { method: "DELETE", url: `/comments/${bobs.id}` })).statusCode).toBe(404);
    expect((await ctx.as(bob, { method: "DELETE", url: `/comments/${bobs.id}` })).statusCode).toBe(204);
    expect((await ctx.as(alice, { method: "DELETE", url: `/comments/${carols.id}` })).statusCode).toBe(204);
    expect(await commentCount(alice, post)).toBe(0);
  });

  it("can't comment on posts you can't see or across a block", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const pending = (await ctx.db<{ id: string }[]>`insert into public.posts (author_id) values (${alice}) returning id`)[0]?.id;
    expect((await comment(bob, pending ?? "", "hi")).statusCode).toBe(404);

    const post = await visiblePost(alice);
    await ctx.as(alice, { method: "PUT", url: `/users/${bob}/block` });
    expect((await comment(bob, post, "hi")).statusCode).toBe(404);
  });

  it("hides comments from people you blocked", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const carol = await ctx.createUser();
    const post = await visiblePost(alice);
    await comment(bob, post, "from bob");
    await comment(carol, post, "from carol");
    await ctx.as(carol, { method: "PUT", url: `/users/${bob}/block` });
    expect((await list(carol, post)).comments.map((c) => c.body)).toEqual(["from carol"]);
  });

  it("shows a hidden comment to its author only, and leaves it out of the count", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const post = await visiblePost(alice);
    const c = (await comment(bob, post, "rude")).json() as Comment;
    await ctx.db`update public.comments set status = 'hidden' where id = ${c.id}`;
    expect(await commentCount(alice, post)).toBe(0);
    expect((await list(alice, post)).comments).toEqual([]);
    expect((await list(bob, post)).comments).toEqual([expect.objectContaining({ id: c.id, status: "hidden" })]);
  });

  it("tells the post's author in notifications", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const post = await visiblePost(alice);
    await comment(bob, post, "great night");
    await comment(alice, post, "my own reply"); // not a notification
    const res = (await ctx.as(alice, { method: "GET", url: "/notifications" })).json() as {
      notifications: { type: string; comment_text: string | null; post_id: string }[];
    };
    expect(res.notifications).toEqual([
      expect.objectContaining({ type: "comment", comment_text: "great night", post_id: post }),
    ]);
  });

  it("can be reported and removed by a moderator", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const mod = await ctx.createUser();
    await ctx.db`insert into public.moderators (user_id) values (${mod})`;
    const post = await visiblePost(alice);
    const c = (await comment(bob, post, "spam")).json() as Comment;

    const report = await ctx.as(alice, {
      method: "POST",
      url: "/reports",
      payload: { target_type: "comment", target_id: c.id, reason: "Spam" },
    });
    expect(report.statusCode, report.body).toBe(204);
    const queue = (await ctx.as(mod, { method: "GET", url: "/moderation/queue" })).json() as {
      items: { target_type: string; preview: { body: string } }[];
    };
    expect(queue.items).toEqual([expect.objectContaining({ target_type: "comment", preview: expect.objectContaining({ body: "spam" }) })]);

    const removed = await ctx.as(mod, {
      method: "POST",
      url: "/moderation/actions",
      payload: { target_type: "comment", target_id: c.id, action: "remove" },
    });
    expect(removed.statusCode, removed.body).toBe(204);
    expect((await list(alice, post)).comments).toEqual([]);
    expect(await commentCount(alice, post)).toBe(0);
  });
});

describe("editing", () => {
  it("edits a post's caption, and clearing it removes it", async () => {
    const alice = await ctx.createUser();
    const post = await visiblePost(alice);
    const edit = (caption: string | null) =>
      ctx.as(alice, { method: "PATCH", url: `/posts/${post}`, payload: { caption } });
    expect((await edit("new words")).json()).toMatchObject({ caption: "new words" });
    expect((await edit("")).json()).toMatchObject({ caption: null });
  });

  it("edits, cancels and clears details of a party", async () => {
    const alice = await ctx.createUser();
    const created = await ctx.as(alice, {
      method: "POST",
      url: "/events",
      payload: {
        title: "Party", description: "Bring snacks", venue_name: "Roof",
        starts_at: new Date(Date.now() + 86400_000).toISOString(), lat: 51.5, lng: -0.12, publish: true,
      },
    });
    const id = (created.json() as { id: string }).id;
    const patch = (payload: object) => ctx.as(alice, { method: "PATCH", url: `/events/${id}`, payload });

    const edited = await patch({ title: "Bigger party", description: "", venue_name: "", lat: 51.6, lng: -0.1 });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json()).toMatchObject({ title: "Bigger party", description: null, venue_name: null, lat: 51.6 });
    expect((await patch({ status: "cancelled" })).json()).toMatchObject({ status: "cancelled" });
    expect(await ctx.db`select topic from public.outbox where topic = 'event.cancelled'`).toHaveLength(1);
  });
});
