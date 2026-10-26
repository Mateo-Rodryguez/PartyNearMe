import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

const inHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

async function named(username: string, displayName: string | null = null) {
  const id = await ctx.createUser();
  await ctx.db`update public.profiles set username = ${username}, display_name = ${displayName} where id = ${id}`;
  return id;
}

async function party(organiser: string, publish = true) {
  const res = await ctx.as(organiser, {
    method: "POST",
    url: "/events",
    payload: { title: "Party", starts_at: inHours(24), lat: 51.5, lng: -0.12, publish },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { id: string }).id;
}

const follow = (from: string, to: string) => ctx.as(from, { method: "PUT", url: `/users/${to}/follow` });

describe("profile counters and relationship status", () => {
  it("counts hosted and going parties once each, leaving out drafts and maybes", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const hosted = await party(alice);
    await party(alice, false); // a draft
    const bobs = await party(bob);
    const other = await party(bob);
    const rsvp = (ev: string, status: string) =>
      ctx.as(alice, { method: "PUT", url: `/events/${ev}/rsvp`, payload: { status } });
    await rsvp(hosted, "going"); // her own party counts once
    await rsvp(bobs, "going");
    await rsvp(other, "interested");

    const res = await ctx.as(bob, { method: "GET", url: `/users/${alice}` });
    expect(res.json()).toMatchObject({ parties: 2, followers: 0, relationship_status: null });
  });

  it("sets and clears the relationship status", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const set = await ctx.as(alice, { method: "PATCH", url: "/me", payload: { relationship_status: "talking" } });
    expect(set.json()).toMatchObject({ relationship_status: "talking" });
    expect((await ctx.as(bob, { method: "GET", url: `/users/${alice}` })).json()).toMatchObject({ relationship_status: "talking" });

    const bad = await ctx.as(alice, { method: "PATCH", url: "/me", payload: { relationship_status: "married" } });
    expect(bad.statusCode).toBe(400);
    const cleared = await ctx.as(alice, { method: "PATCH", url: "/me", payload: { relationship_status: null } });
    expect(cleared.json()).toMatchObject({ relationship_status: null });
  });
});

describe("GET /users/search", () => {
  it("finds usernames by their start and names anywhere, best match first", async () => {
    const me = await named("viewer");
    const sam = await named("sam", "Sam Rivera");
    const samantha = await named("samantha_k");
    const rosa = await named("rosa", "Rosa Sampson");
    await named("alex", "Alex Chen");

    const search = async (q: string) =>
      ((await ctx.as(me, { method: "GET", url: `/users/search?q=${encodeURIComponent(q)}` })).json() as {
        users: { id: string }[];
      }).users.map((u) => u.id);

    expect(await search("sam")).toEqual([sam, samantha, rosa]);
    expect(await search("@SAM")).toEqual([sam, samantha, rosa]);
    expect(await search("viewer")).toEqual([]); // not yourself
    expect(await search("%")).toEqual([]); // wildcards are taken literally
  });

  it("leaves out people blocked either way", async () => {
    const me = await named("viewer");
    const sam = await named("sam");
    await named("sami");
    await ctx.as(sam, { method: "PUT", url: `/users/${me}/block` });
    const res = await ctx.as(me, { method: "GET", url: "/users/search?q=sam" });
    expect((res.json() as { users: { username: string }[] }).users.map((u) => u.username)).toEqual(["sami"]);
  });
});

describe("followers and following lists", () => {
  it("lists people newest first, pages, and says who the viewer follows", async () => {
    const star = await named("star");
    const [a, b, c] = [await named("fan_a"), await named("fan_b"), await named("fan_c")];
    const fans = [a, b, c];
    for (const fan of fans) await follow(fan, star);
    await ctx.db`update public.follows set created_at = now() - (interval '1 minute' * array_position(${fans}::uuid[], follower_id))`;
    await follow(star, b);

    const first = (await ctx.as(a, { method: "GET", url: `/users/${star}/followers?limit=2` })).json() as {
      users: { id: string; is_following: boolean }[];
      next_cursor: string | null;
    };
    expect(first.users.map((u) => u.id)).toEqual([a, b]);
    expect(first.next_cursor).not.toBeNull();
    const second = (await ctx.as(a, {
      method: "GET",
      url: `/users/${star}/followers?limit=2&cursor=${first.next_cursor}`,
    })).json() as { users: { id: string }[]; next_cursor: string | null };
    expect(second.users.map((u) => u.id)).toEqual([c]);
    expect(second.next_cursor).toBeNull();

    const following = (await ctx.as(a, { method: "GET", url: `/users/${star}/following` })).json() as {
      users: { id: string; is_following: boolean }[];
    };
    expect(following.users).toEqual([expect.objectContaining({ id: b, is_following: false })]);
  });

  it("lists the people you blocked", async () => {
    const me = await ctx.createUser();
    const pest = await named("pest");
    await ctx.as(me, { method: "PUT", url: `/users/${pest}/block` });
    const res = await ctx.as(me, { method: "GET", url: "/me/blocks" });
    expect(res.json()).toMatchObject({ users: [{ id: pest, username: "pest" }] });
  });
});

describe("saving posts and parties", () => {
  async function visiblePost(authorId: string) {
    const [row] = await ctx.db<{ id: string }[]>`
      insert into public.posts (author_id, status) values (${authorId}, 'visible') returning id
    `;
    if (!row) throw new Error("insert returned no row");
    return row.id;
  }

  it("saves and unsaves posts, privately", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const older = await visiblePost(bob);
    const newer = await visiblePost(bob);
    expect((await ctx.as(alice, { method: "PUT", url: `/posts/${newer}/save` })).statusCode).toBe(204);
    expect((await ctx.as(alice, { method: "PUT", url: `/posts/${older}/save` })).statusCode).toBe(204);
    expect((await ctx.as(alice, { method: "PUT", url: `/posts/${older}/save` })).statusCode).toBe(204);

    const saved = (await ctx.as(alice, { method: "GET", url: "/me/saved/posts" })).json() as {
      posts: { id: string; saved_by_me: boolean }[];
    };
    // Most recently saved first.
    expect(saved.posts.map((p) => [p.id, p.saved_by_me])).toEqual([[older, true], [newer, true]]);
    expect((await ctx.as(bob, { method: "GET", url: `/posts/${older}` })).json()).toMatchObject({ saved_by_me: false });
    expect((await ctx.as(bob, { method: "GET", url: "/me/saved/posts" })).json()).toMatchObject({ posts: [] });

    await ctx.as(alice, { method: "DELETE", url: `/posts/${older}/save` });
    const after = (await ctx.as(alice, { method: "GET", url: "/me/saved/posts" })).json() as { posts: { id: string }[] };
    expect(after.posts.map((p) => p.id)).toEqual([newer]);
  });

  it("drops saved posts that were hidden, and can't save what you can't see", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const post = await visiblePost(bob);
    await ctx.as(alice, { method: "PUT", url: `/posts/${post}/save` });
    await ctx.db`update public.posts set status = 'hidden' where id = ${post}`;
    expect((await ctx.as(alice, { method: "GET", url: "/me/saved/posts" })).json()).toMatchObject({ posts: [] });
    expect((await ctx.as(alice, { method: "PUT", url: `/posts/${post}/save` })).statusCode).toBe(404);
  });

  it("saves parties", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const ev = await party(bob);
    const draft = await party(bob, false);
    expect((await ctx.as(alice, { method: "PUT", url: `/events/${ev}/save` })).statusCode).toBe(204);
    expect((await ctx.as(alice, { method: "PUT", url: `/events/${draft}/save` })).statusCode).toBe(404);
    expect((await ctx.as(alice, { method: "GET", url: `/events/${ev}` })).json()).toMatchObject({ saved_by_me: true });
    expect((await ctx.as(alice, { method: "GET", url: "/me/saved/events" })).json()).toMatchObject({ events: [{ id: ev }] });

    await ctx.as(alice, { method: "DELETE", url: `/events/${ev}/save` });
    expect((await ctx.as(alice, { method: "GET", url: "/me/saved/events" })).json()).toMatchObject({ events: [] });
  });
});

describe("settings", () => {
  it("starts with the defaults and changes only what is sent", async () => {
    const alice = await ctx.createUser();
    const defaults = await ctx.as(alice, { method: "GET", url: "/me/settings" });
    expect(defaults.json()).toEqual({ messages_from: "everyone", push_messages: true, push_rsvps: true, push_reminders: true });

    await ctx.as(alice, { method: "PATCH", url: "/me/settings", payload: { push_rsvps: false } });
    const changed = await ctx.as(alice, { method: "PATCH", url: "/me/settings", payload: { messages_from: "following" } });
    expect(changed.json()).toEqual({ messages_from: "following", push_messages: true, push_rsvps: false, push_reminders: true });

    expect((await ctx.as(alice, { method: "PATCH", url: "/me/settings", payload: {} })).statusCode).toBe(400);
    expect((await ctx.as(alice, { method: "PATCH", url: "/me/settings", payload: { user_id: alice } })).statusCode).toBe(400);
  });

  it("keeps settings private", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await ctx.as(alice, { method: "PATCH", url: "/me/settings", payload: { push_messages: false } });
    expect((await ctx.as(bob, { method: "GET", url: "/me/settings" })).json()).toMatchObject({ push_messages: true });
  });

  it("lets only followed people start a chat when set, keeping existing chats", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const carol = await ctx.createUser();
    const start = (from: string, to: string) =>
      ctx.as(from, { method: "POST", url: "/conversations", payload: { user_id: to } });
    expect((await start(carol, alice)).statusCode).toBe(200);
    await ctx.as(alice, { method: "PATCH", url: "/me/settings", payload: { messages_from: "following" } });

    const refused = await start(bob, alice);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().message).toMatch(/people they follow/);
    expect((await start(carol, alice)).statusCode).toBe(200);

    await follow(alice, bob);
    expect((await start(bob, alice)).statusCode).toBe(200);
  });
});
