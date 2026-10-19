import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

const inHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

type Notification = { id: string; type: string; actor: { id: string } | null; post_id: string | null; event_id: string | null; unread: boolean };

async function notifications(userId: string) {
  const res = await ctx.as(userId, { method: "GET", url: "/notifications" });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as { notifications: Notification[]; unread_count: number };
}

async function visiblePost(authorId: string) {
  const [row] = await ctx.db<{ id: string }[]>`
    insert into public.posts (author_id, status) values (${authorId}, 'visible') returning id
  `;
  if (!row) throw new Error("post not created");
  return row.id;
}

async function party(organiserId: string, startsInHours = 48) {
  const res = await ctx.as(organiserId, {
    method: "POST",
    url: "/events",
    payload: { title: "Rooftop", starts_at: inHours(startsInHours), lat: 51.5, lng: -0.12, publish: true },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { id: string }).id;
}

describe("GET /notifications", () => {
  it("lists likes, follows and RSVPs to the user's things, newest first", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const post = await visiblePost(alice);
    const event = await party(alice);

    await ctx.as(bob, { method: "PUT", url: `/posts/${post}/like` });
    await ctx.as(bob, { method: "PUT", url: `/users/${alice}/follow` });
    await ctx.as(bob, { method: "PUT", url: `/events/${event}/rsvp`, payload: { status: "going" } });

    const { notifications: list, unread_count } = await notifications(alice);
    expect(list.map((n) => n.type).sort()).toEqual(["follow", "like", "rsvp"]);
    expect(list.every((n) => n.actor?.id === bob && n.unread)).toBe(true);
    expect(list.find((n) => n.type === "like")?.post_id).toBe(post);
    expect(list.find((n) => n.type === "rsvp")?.event_id).toBe(event);
    expect(unread_count).toBe(3);

    // Bob's own list stays empty: none of this happened to him.
    expect((await notifications(bob)).notifications).toEqual([]);
  });

  it("leaves out the user's own actions, 'interested' RSVPs and undone actions", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const post = await visiblePost(alice);
    const event = await party(alice);

    await ctx.as(alice, { method: "PUT", url: `/posts/${post}/like` });
    await ctx.as(bob, { method: "PUT", url: `/events/${event}/rsvp`, payload: { status: "interested" } });
    await ctx.as(bob, { method: "PUT", url: `/users/${alice}/follow` });
    await ctx.as(bob, { method: "DELETE", url: `/users/${alice}/follow` });

    expect((await notifications(alice)).notifications).toEqual([]);
  });

  it("hides people the user blocked", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await ctx.as(bob, { method: "PUT", url: `/users/${alice}/follow` });
    await ctx.as(alice, { method: "PUT", url: `/users/${bob}/block` });
    expect((await notifications(alice)).notifications).toEqual([]);
  });

  it("reminds people of a party they're going to the day before", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const soon = await party(alice, 5);
    const later = await party(alice, 72);
    await ctx.as(bob, { method: "PUT", url: `/events/${soon}/rsvp`, payload: { status: "going" } });
    await ctx.as(bob, { method: "PUT", url: `/events/${later}/rsvp`, payload: { status: "going" } });

    const list = (await notifications(bob)).notifications;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: "reminder", actor: null, event_id: soon });
  });
});

describe("POST /notifications/seen", () => {
  it("clears the unread count without removing anything", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await ctx.as(bob, { method: "PUT", url: `/users/${alice}/follow` });
    expect((await ctx.as(alice, { method: "GET", url: "/notifications/unread" })).json()).toEqual({ unread_count: 1 });

    expect((await ctx.as(alice, { method: "POST", url: "/notifications/seen" })).statusCode).toBe(204);

    expect((await ctx.as(alice, { method: "GET", url: "/notifications/unread" })).json()).toEqual({ unread_count: 0 });
    const after = await notifications(alice);
    expect(after.notifications).toHaveLength(1);
    expect(after.notifications[0]?.unread).toBe(false);
  });
});
