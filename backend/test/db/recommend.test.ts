import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

const LONDON = { lat: 51.5072, lng: -0.1276 };
const MUSIC = 1;
const SPORTS = 2;

/** A published public party, `km` east of central London, starting in `hours`. */
async function party(host: string, opts: { km?: number; hours?: number; interest?: number | null; isPrivate?: boolean } = {}) {
  const lng = LONDON.lng + (opts.km ?? 0) / 69.4; // ~69 km per degree of longitude here
  const [row] = await ctx.db<{ id: string }[]>`
    insert into public.events (organiser_id, title, starts_at, location, status, interest_id, is_private)
    values (${host}, 'Party', now() + ${`${opts.hours ?? 48} hours`}::interval,
            extensions.st_point(${lng}, ${LONDON.lat}, 4326)::extensions.geography, 'published',
            ${opts.interest === undefined ? MUSIC : opts.interest}, ${opts.isPrivate ?? false})
    returning id
  `;
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

type ForYou = { events: { id: string; reason: { kind: string; text: string } | null; distance_m: number }[]; serve_id: string };
const forYou = async (userId: string, params: Record<string, string | number> = {}) => {
  const res = await ctx.as(userId, {
    method: "GET",
    url: `/events/for-you?${new URLSearchParams(Object.entries({ ...LONDON, ...params }).map(([k, v]): [string, string] => [k, String(v)]))}`,
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as ForYou;
};
const ids = (r: ForYou) => r.events.map((e) => e.id);

const log = (userId: string, events: Record<string, unknown>[]) =>
  ctx.as(userId, { method: "POST", url: "/interactions", payload: { events } });

describe("GET /events/for-you", () => {
  it("ranks the kind of party I picked above a closer one I didn't", async () => {
    const me = await ctx.createUser();
    const [a, b] = [await ctx.createUser(), await ctx.createUser()];
    await ctx.db`insert into public.user_interests (user_id, interest_id) values (${me}, ${SPORTS})`;
    const nextDoor = await party(a, { km: 0.2, interest: MUSIC });
    const sports = await party(b, { km: 6, interest: SPORTS });

    const res = await forYou(me);
    expect(ids(res)).toEqual([sports, nextDoor]);
    expect(res.events[0]?.reason).toEqual({ kind: "interest", text: "Because you like Sports" });
    expect(res.events[1]?.reason?.kind).toBe("nearby");
  });

  it("learns from what I do: RSVPs pull a kind up, 'not interested' pushes it down", async () => {
    const me = await ctx.createUser();
    const [a, b, c] = [await ctx.createUser(), await ctx.createUser(), await ctx.createUser()];
    // Past parties I went to were sports; one music party I said no to.
    const pastSports = await party(c, { hours: 2, interest: SPORTS });
    await ctx.as(me, { method: "PUT", url: `/events/${pastSports}/rsvp`, payload: { status: "going" } });
    const shunned = await party(c, { hours: 3, interest: MUSIC });
    expect((await log(me, [{ kind: "not_interested", event_id: shunned }])).statusCode).toBe(202);

    const music = await party(a, { km: 0.5, interest: MUSIC });
    const sports = await party(b, { km: 5, interest: SPORTS });
    const order = ids(await forYou(me));
    expect(order).not.toContain(shunned);
    expect(order.indexOf(sports)).toBeLessThan(order.indexOf(music));
  });

  it("leads with parties my friends are going to and hosts I follow", async () => {
    const me = await ctx.createUser();
    const [friend, host, stranger] = [await ctx.createUser(), await ctx.createUser(), await ctx.createUser()];
    await ctx.as(me, { method: "PUT", url: `/users/${friend}/follow` });
    await ctx.as(me, { method: "PUT", url: `/users/${host}/follow` });
    const plain = await party(stranger, { km: 0.3, interest: null });
    const withFriend = await party(stranger, { km: 8, interest: null });
    await ctx.as(friend, { method: "PUT", url: `/events/${withFriend}/rsvp`, payload: { status: "going" } });
    const followed = await party(host, { km: 8, interest: null });

    const res = await forYou(me);
    expect(ids(res).indexOf(plain)).toBe(2);
    const reasons = Object.fromEntries(res.events.map((e) => [e.id, e.reason?.kind]));
    expect(reasons[withFriend]).toBe("friends_going");
    expect(reasons[followed]).toBe("following_host");
  });

  it("leaves out private, blocked, far and past parties", async () => {
    const me = await ctx.createUser();
    const [a, blocked] = [await ctx.createUser(), await ctx.createUser()];
    const shown = await party(a);
    await party(a, { isPrivate: true });
    await party(blocked);
    await party(a, { km: 40 });
    await party(a, { hours: -24 });
    await ctx.as(me, { method: "PUT", url: `/users/${blocked}/block` });

    expect(ids(await forYou(me))).toEqual([shown]);
    expect(ids(await forYou(me, { radius_km: 50 }))).toHaveLength(2);
  });

  it("puts my own party first, without a reason, and leaves it out of the stats", async () => {
    const me = await ctx.createUser();
    const a = await ctx.createUser();
    const theirs = await party(a, { hours: 2 });
    const mine = await party(me, { hours: 72, km: 5 });

    const res = await forYou(me);
    expect(ids(res)).toEqual([mine, theirs]);
    expect(res.events[0]?.reason).toBeNull();
    const [serve] = await ctx.db`select items from public.recommendation_serves where id = ${res.serve_id}`;
    expect((serve?.items as { id: string }[]).map((i) => i.id)).toEqual([theirs]);
  });

  it("filters by kind and logs what it served, for measuring", async () => {
    const me = await ctx.createUser();
    const a = await ctx.createUser();
    const music = await party(a, { interest: MUSIC });
    await party(a, { interest: SPORTS });

    const res = await forYou(me, { interest_id: MUSIC });
    expect(ids(res)).toEqual([music]);
    const [serve] = await ctx.db`select user_id, surface, items from public.recommendation_serves where id = ${res.serve_id}`;
    expect(serve?.user_id).toBe(me);
    expect(serve?.surface).toBe("for_you_parties");
    const items = serve?.items as { id: string; score: number; parts: Record<string, number> }[];
    expect(items[0]?.id).toBe(music);
    expect(Object.keys(items[0]?.parts ?? {}).sort()).toEqual(["friends", "host", "interest", "nearby", "popular", "soon"]);
  });
});

describe("GET /moderation/recommendation-stats", () => {
  it("counts impressions and what came of them, for moderators only", async () => {
    const me = await ctx.createUser();
    const mod = await ctx.createUser();
    const a = await ctx.createUser();
    await ctx.db`insert into public.user_interests (user_id, interest_id) values (${me}, ${MUSIC})`;
    const p1 = await party(a, { interest: MUSIC });
    const p2 = await party(a, { interest: SPORTS, km: 3 });
    const { serve_id } = await forYou(me);

    expect((await log(me, [
      { kind: "impression", event_id: p1, surface: "for_you_parties", serve_id, position: 0 },
      { kind: "impression", event_id: p1, surface: "for_you_parties", serve_id, position: 0 }, // seen twice, counted once
      { kind: "impression", event_id: p2, surface: "for_you_parties", serve_id, position: 1 },
      { kind: "open", event_id: p1, surface: "for_you_parties", serve_id, position: 0 },
    ])).statusCode).toBe(202);
    await ctx.as(me, { method: "PUT", url: `/events/${p1}/rsvp`, payload: { status: "going" } });

    const url = "/moderation/recommendation-stats";
    expect((await ctx.as(me, { method: "GET", url })).statusCode).toBe(403);
    await ctx.db`insert into public.moderators (user_id) values (${mod})`;
    const res = await ctx.as(mod, { method: "GET", url });
    expect(res.statusCode, res.body).toBe(200);
    const stats = res.json() as {
      by_day: { surface: string; users: number; impressions: number; opens: number; rsvps: number }[];
      by_reason: { reason: string; impressions: number; opens: number }[];
      by_position: { positions: string; impressions: number }[];
    };
    expect(stats.by_day).toEqual([
      expect.objectContaining({ surface: "for_you_parties", users: 1, impressions: 2, opens: 1, rsvps: 1, likes: 0 }),
    ]);
    expect(stats.by_reason.find((r) => r.reason === "interest")).toMatchObject({ impressions: 1, opens: 1 });
    expect(stats.by_position).toEqual([expect.objectContaining({ positions: "1-3", impressions: 2 })]);
  });
});

describe("GET /feed with affinity", () => {
  it("ranks posts from people I engage with above a stranger's, and returns a serve id", async () => {
    const me = await ctx.createUser();
    const [liked, stranger] = [await ctx.createUser(), await ctx.createUser()];
    const post = async (author: string, hoursAgo: number) => {
      const [row] = await ctx.db<{ id: string }[]>`
        insert into public.posts (author_id, caption, status, created_at)
        values (${author}, 'p', 'visible', now() - ${`${hoursAgo} hours`}::interval) returning id
      `;
      return row?.id as string;
    };
    // I liked three of this person's older posts.
    for (let i = 0; i < 3; i++) {
      const old = await post(liked, 24 * 10 + i);
      await ctx.db`insert into public.likes (post_id, user_id) values (${old}, ${me})`;
    }
    const fromStranger = await post(stranger, 1);
    const fromLiked = await post(liked, 6);

    const res = await ctx.as(me, { method: "GET", url: "/feed" });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { posts: { id: string }[]; serve_id: string };
    expect(body.posts.map((p) => p.id)).toEqual([fromLiked, fromStranger]);
    expect(body.serve_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
