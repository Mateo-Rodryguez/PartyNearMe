import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

const LONDON = { lat: 51.5072, lng: -0.1276 };
const PARIS = { lat: 48.8566, lng: 2.3522 };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

/** Inserts a moderated post directly, as the worker would leave it. */
async function post(
  authorId: string,
  opts: { at?: { lat: number; lng: number }; age?: number; likes?: number; status?: string; eventId?: string } = {},
) {
  const location = opts.at
    ? ctx.db`extensions.st_setsrid(extensions.st_makepoint(${opts.at.lng}, ${opts.at.lat}), 4326)::extensions.geography`
    : ctx.db`null`;
  const [row] = await ctx.db<{ id: string }[]>`
    insert into public.posts (author_id, caption, status, like_count, created_at, location, event_id)
    values (${authorId}, 'p', ${opts.status ?? "visible"}, ${opts.likes ?? 0}, ${hoursAgo(opts.age ?? 1)},
            ${location}, ${opts.eventId ?? null})
    returning id
  `;
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

const feed = (userId: string, params: Record<string, string | number> = {}) =>
  ctx.as(userId, {
    method: "GET",
    url: `/feed?${new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]))}`,
  });
const ids = (res: { json: () => unknown }) => (res.json() as { posts: { id: string }[] }).posts.map((p) => p.id);

describe("GET /feed", () => {
  it("shows other people's visible posts only", async () => {
    const me = await ctx.createUser();
    const alice = await ctx.createUser();
    const visible = await post(alice);
    await post(alice, { status: "pending" });
    await post(alice, { status: "hidden" });
    await post(alice, { age: 24 * 8 }); // older than a week
    await post(me);

    const res = await feed(me);
    expect(res.statusCode, res.body).toBe(200);
    expect(ids(res)).toEqual([visible]);
  });

  it("ranks people I follow, then nearby, above fresh posts from strangers", async () => {
    const me = await ctx.createUser();
    const [friend, local, stranger] = [await ctx.createUser(), await ctx.createUser(), await ctx.createUser()];
    await ctx.as(me, { method: "PUT", url: `/users/${friend}/follow` });

    const strangerPost = await post(stranger, { at: PARIS, age: 0.1 });
    const localPost = await post(local, { at: LONDON, age: 10 });
    const friendPost = await post(friend, { age: 20 });

    expect(ids(await feed(me, LONDON))).toEqual([friendPost, localPost, strangerPost]);
  });

  it("boosts posts from events happening soon and events I'm going to", async () => {
    const me = await ctx.createUser();
    const alice = await ctx.createUser();
    const event = async (startsInHours: number) => {
      const [row] = await ctx.db<{ id: string }[]>`
        insert into public.events (organiser_id, title, starts_at, location, status)
        values (${alice}, 'Party', now() + ${`${startsInHours} hours`}::interval,
                extensions.st_point(-0.1276, 51.5072, 4326)::extensions.geography, 'published')
        returning id
      `;
      if (!row) throw new Error("insert returned no row");
      return row.id;
    };
    const soon = await event(5);
    const later = await event(24 * 10);
    const plain = await post(alice, { age: 1 });
    const fromSoon = await post(alice, { age: 1, eventId: soon });
    const fromMine = await post(alice, { age: 1, eventId: later });
    await ctx.as(me, { method: "PUT", url: `/events/${later}/rsvp`, payload: { status: "going" } });

    const order = ids(await feed(me));
    expect(order.indexOf(plain)).toBe(2);
    expect(new Set(order.slice(0, 2))).toEqual(new Set([fromSoon, fromMine]));
  });

  it("drops blocked authors in both directions and posts I'm not interested in", async () => {
    const me = await ctx.createUser();
    const [blocked, blocker, other] = [await ctx.createUser(), await ctx.createUser(), await ctx.createUser()];
    await post(blocked);
    await post(blocker);
    const skipped = await post(other);
    const kept = await post(other);
    await ctx.as(me, { method: "PUT", url: `/users/${blocked}/block` });
    await ctx.as(blocker, { method: "PUT", url: `/users/${me}/block` });
    const logged = await ctx.as(me, {
      method: "POST",
      url: "/interactions",
      payload: { events: [{ kind: "not_interested", post_id: skipped }] },
    });
    expect(logged.statusCode, logged.body).toBe(202);

    expect(ids(await feed(me))).toEqual([kept]);
  });

  it("moves posts I've already seen down", async () => {
    const me = await ctx.createUser();
    const alice = await ctx.createUser();
    const seen = await post(alice, { age: 1 });
    const unseen = await post(alice, { age: 5 });
    expect(ids(await feed(me))).toEqual([seen, unseen]);

    await ctx.as(me, { method: "POST", url: "/interactions", payload: { events: [{ kind: "impression", post_id: seen }] } });
    expect(ids(await feed(me))).toEqual([unseen, seen]);
  });

  it("never shows more than two in a row from one author", async () => {
    const me = await ctx.createUser();
    const [busy, quiet] = [await ctx.createUser(), await ctx.createUser()];
    const busyPosts = [];
    for (let i = 0; i < 4; i++) busyPosts.push(await post(busy, { age: i }));
    const quietPost = await post(quiet, { age: 30 });

    expect(ids(await feed(me))).toEqual([busyPosts[0], busyPosts[1], quietPost, busyPosts[2], busyPosts[3]]);
  });

  it("pages through one ranked list without repeats, even as new posts arrive", async () => {
    const me = await ctx.createUser();
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    for (let i = 0; i < 5; i++) {
      await post(alice, { age: i });
      await post(bob, { age: i });
    }

    const first = await feed(me, { limit: 4 });
    const seen = ids(first);
    await post(alice, { age: 0 }); // arrives mid-scroll: waits for the next refresh
    let cursor = (first.json() as { next_cursor: string | null }).next_cursor;
    while (cursor) {
      const res = await feed(me, { limit: 4, cursor });
      seen.push(...ids(res));
      cursor = (res.json() as { next_cursor: string | null }).next_cursor;
    }
    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
  });

  it("refuses someone else's or an expired cursor", async () => {
    const me = await ctx.createUser();
    const other = await ctx.createUser();
    const alice = await ctx.createUser();
    await post(alice);
    await post(alice);
    const cursor = (await feed(me, { limit: 1 })).json().next_cursor as string;

    expect((await feed(other, { cursor })).statusCode).toBe(410);
    await ctx.db`update public.feed_snapshots set created_at = now() - interval '2 hours'`;
    expect((await feed(me, { cursor })).statusCode).toBe(410);
    expect((await feed(me, { cursor: "garbage" })).statusCode).toBe(400);
  });

  it("drops posts removed after the list was ranked", async () => {
    const me = await ctx.createUser();
    const alice = await ctx.createUser();
    const removed = await post(alice, { age: 1 });
    const kept = await post(alice, { age: 2 });
    const cursor = (await feed(me, { limit: 1 })).json().next_cursor as string;
    await ctx.db`update public.posts set status = 'removed' where id = ${removed}`;
    expect(ids(await feed(me, { cursor }))).toEqual([kept]);
  });
});

describe("POST /interactions", () => {
  it("stores events against the signed-in user", async () => {
    const me = await ctx.createUser();
    const alice = await ctx.createUser();
    const p = await post(alice);
    const res = await ctx.as(me, {
      method: "POST",
      url: "/interactions",
      payload: { events: [{ kind: "impression", post_id: p }, { kind: "dwell", post_id: p, dwell_ms: 3200 }] },
    });
    expect(res.statusCode, res.body).toBe(202);
    const rows = await ctx.db`select user_id, kind, dwell_ms from public.interactions order by id`;
    expect(rows.map((r) => [r.user_id, r.kind, r.dwell_ms])).toEqual([
      [me, "impression", null],
      [me, "dwell", 3200],
    ]);
  });

  it("rejects bad batches", async () => {
    const me = await ctx.createUser();
    const id = "00000000-0000-0000-0000-000000000001";
    for (const events of [
      [],
      [{ kind: "like", post_id: id }],
      [{ kind: "impression" }],
      [{ kind: "dwell", post_id: id }],
      [{ kind: "impression", post_id: id, dwell_ms: 5 }],
      [{ kind: "impression", post_id: id, user_id: id }],
      Array.from({ length: 51 }, () => ({ kind: "impression", post_id: id })),
    ]) {
      const res = await ctx.as(me, { method: "POST", url: "/interactions", payload: { events } });
      expect(res.statusCode, JSON.stringify(events).slice(0, 80)).toBe(400);
    }
  });
});
