import { describe, expect, it } from "vitest";
import { useDbApp } from "./context.js";

const ctx = useDbApp();

// Central London and a point ~3 km away; Paris is ~340 km away.
const LONDON = { lat: 51.5072, lng: -0.1276 };
const NEARBY = { lat: 51.5255, lng: -0.0877 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

const inHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

async function createEvent(userId: string, overrides: Record<string, unknown> = {}) {
  const res = await ctx.as(userId, {
    method: "POST",
    url: "/events",
    payload: { title: "Party", starts_at: inHours(24), ...LONDON, publish: true, ...overrides },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; [k: string]: unknown };
}

describe("creating and editing events", () => {
  it("creates an event with its organiser and location", async () => {
    const alice = await ctx.createUser();
    const ev = await createEvent(alice, { title: "Rooftop", venue_name: "The Roof" });
    expect(ev).toMatchObject({
      title: "Rooftop",
      venue_name: "The Roof",
      status: "published",
      organiser: { id: alice },
      going_count: 0,
      my_rsvp: null,
    });
    expect(ev.lat).toBeCloseTo(LONDON.lat, 5);
    expect(ev.lng).toBeCloseTo(LONDON.lng, 5);
  });

  it("keeps drafts private to the organiser", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const draft = await createEvent(alice, { publish: false });
    expect(draft.status).toBe("draft");
    expect((await ctx.as(alice, { method: "GET", url: `/events/${draft.id}` })).statusCode).toBe(200);
    expect((await ctx.as(bob, { method: "GET", url: `/events/${draft.id}` })).statusCode).toBe(404);
  });

  it("validates times and coordinates", async () => {
    const alice = await ctx.createUser();
    const bad = [
      { starts_at: inHours(-5) },
      { starts_at: inHours(10), ends_at: inHours(9) },
      { starts_at: inHours(10), ends_at: inHours(10 + 24 * 8) },
      { lat: 91 },
      { starts_at: "tomorrow" },
      { organiser_id: alice },
    ];
    for (const overrides of bad) {
      const res = await ctx.as(alice, {
        method: "POST",
        url: "/events",
        payload: { title: "x", starts_at: inHours(24), ...LONDON, ...overrides },
      });
      expect(res.statusCode, JSON.stringify(overrides)).toBe(400);
    }
  });

  it("lets only the organiser edit or delete", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const ev = await createEvent(alice);

    const hijack = await ctx.as(bob, { method: "PATCH", url: `/events/${ev.id}`, payload: { title: "Mine now" } });
    expect(hijack.statusCode).toBe(404);
    expect((await ctx.as(bob, { method: "DELETE", url: `/events/${ev.id}` })).statusCode).toBe(404);

    const edited = await ctx.as(alice, {
      method: "PATCH",
      url: `/events/${ev.id}`,
      payload: { title: "Renamed", ...PARIS, status: "cancelled" },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ title: "Renamed", status: "cancelled" });
    expect(edited.json().lat).toBeCloseTo(PARIS.lat, 5);

    expect((await ctx.as(alice, { method: "DELETE", url: `/events/${ev.id}` })).statusCode).toBe(204);
    expect((await ctx.as(alice, { method: "GET", url: `/events/${ev.id}` })).statusCode).toBe(404);
  });

  it("checks a new end time against the stored start time", async () => {
    const alice = await ctx.createUser();
    const ev = await createEvent(alice, { starts_at: inHours(24) });
    const res = await ctx.as(alice, { method: "PATCH", url: `/events/${ev.id}`, payload: { ends_at: inHours(1) } });
    expect(res.statusCode).toBe(400);
  });

  it("cannot be removed by the organiser through the API", async () => {
    const alice = await ctx.createUser();
    const ev = await createEvent(alice);
    const res = await ctx.as(alice, { method: "PATCH", url: `/events/${ev.id}`, payload: { status: "removed" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("RSVPs", () => {
  it("counts going and interested, and shows my RSVP", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const carol = await ctx.createUser();
    const ev = await createEvent(alice);

    await ctx.as(bob, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status: "going" } });
    const res = await ctx.as(carol, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status: "interested" } });
    expect(res.json()).toMatchObject({ going_count: 1, interested_count: 1, my_rsvp: "interested" });

    const changed = await ctx.as(carol, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status: "going" } });
    expect(changed.json()).toMatchObject({ going_count: 2, interested_count: 0, my_rsvp: "going" });

    expect((await ctx.as(carol, { method: "DELETE", url: `/events/${ev.id}/rsvp` })).statusCode).toBe(204);
    const after = await ctx.as(carol, { method: "GET", url: `/events/${ev.id}` });
    expect(after.json()).toMatchObject({ going_count: 1, my_rsvp: null });
  });

  it("refuses RSVPs to drafts and cancelled events", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const draft = await createEvent(alice, { publish: false });
    const cancelled = await createEvent(alice);
    await ctx.as(alice, { method: "PATCH", url: `/events/${cancelled.id}`, payload: { status: "cancelled" } });

    const rsvp = (id: string) =>
      ctx.as(bob, { method: "PUT", url: `/events/${id}/rsvp`, payload: { status: "going" } });
    expect((await rsvp(draft.id)).statusCode).toBe(404);
    expect((await rsvp(cancelled.id)).statusCode).toBe(409);
  });

  it("lists events I'm going to and events I organise", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const ev = await createEvent(alice);
    await createEvent(alice, { publish: false });
    await ctx.as(bob, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status: "going" } });

    const going = await ctx.as(bob, { method: "GET", url: "/me/events?role=going" });
    expect(going.json().map((e: { id: string }) => e.id)).toEqual([ev.id]);
    const organising = await ctx.as(alice, { method: "GET", url: "/me/events?role=organising" });
    expect(organising.json()).toHaveLength(2);
  });
});

describe("GET /events/nearby", () => {
  const nearby = (userId: string, params: Record<string, string | number>) =>
    ctx.as(userId, {
      method: "GET",
      url: `/events/nearby?${new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]))}`,
    });

  it("finds published events within the radius, soonest first, with distance", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const later = await createEvent(alice, { title: "Later", starts_at: inHours(48), ...NEARBY });
    const sooner = await createEvent(alice, { title: "Sooner", starts_at: inHours(5) });
    await createEvent(alice, { title: "Paris", ...PARIS });
    await createEvent(alice, { title: "Draft", publish: false });
    await createEvent(alice, { title: "Next month", starts_at: inHours(24 * 30) });

    const res = await nearby(bob, { ...LONDON, radius_km: 10 });
    expect(res.statusCode, res.body).toBe(200);
    const { events, next_cursor } = res.json();
    expect(events.map((e: { id: string }) => e.id)).toEqual([sooner.id, later.id]);
    expect(events[0].distance_m).toBe(0);
    expect(events[1].distance_m).toBeGreaterThan(2000);
    expect(events[1].distance_m).toBeLessThan(4000);
    expect(next_cursor).toBeNull();

    const narrow = await nearby(bob, { ...LONDON, radius_km: 1 });
    expect(narrow.json().events.map((e: { id: string }) => e.id)).toEqual([sooner.id]);
  });

  it("includes events already under way", async () => {
    const alice = await ctx.createUser();
    const ev = await createEvent(alice, { starts_at: inHours(-0.5), ends_at: inHours(3) });
    const res = await nearby(alice, LONDON);
    expect(res.json().events.map((e: { id: string }) => e.id)).toEqual([ev.id]);
  });

  it("pages with a cursor without repeating or skipping", async () => {
    const alice = await ctx.createUser();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await createEvent(alice, { starts_at: inHours(2 + i) })).id);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await nearby(alice, { ...LONDON, limit: 2, ...(cursor ? { cursor } : {}) });
      const body = res.json();
      seen.push(...body.events.map((e: { id: string }) => e.id));
      cursor = body.next_cursor;
    } while (cursor);
    expect(seen).toEqual(ids);
  });

  it("hides events from organisers I blocked", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await createEvent(alice);
    await ctx.as(bob, { method: "PUT", url: `/users/${alice}/block` });
    expect((await nearby(bob, LONDON)).json().events).toEqual([]);
  });

  it("rejects bad input", async () => {
    const alice = await ctx.createUser();
    expect((await nearby(alice, { lat: 100, lng: 0 })).statusCode).toBe(400);
    expect((await nearby(alice, { ...LONDON, radius_km: 500 })).statusCode).toBe(400);
    expect((await nearby(alice, { ...LONDON, cursor: "garbage" })).statusCode).toBe(400);
    expect((await nearby(alice, { lng: 0 })).statusCode).toBe(400);
  });
});

describe("friends going", () => {
  it("shows the people you follow who are going, newest first", async () => {
    const [host, me, sam, alex, jo, stranger] = (await Promise.all(Array.from({ length: 6 }, () => ctx.createUser()))) as [
      string, string, string, string, string, string,
    ];
    for (const friend of [sam, alex, jo]) {
      await ctx.as(me, { method: "PUT", url: `/users/${friend}/follow` });
    }
    const ev = await createEvent(host);
    for (const guest of [sam, alex, jo, stranger]) {
      await ctx.as(guest, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status: "going" } });
    }
    // Interested doesn't count as going.
    await ctx.as(jo, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status: "interested" } });
    await ctx.as(me, { method: "PUT", url: `/users/${alex}/block` });

    const seen = (await ctx.as(me, { method: "GET", url: `/events/${ev.id}` })).json();
    expect(seen.friends_going_count).toBe(1);
    expect(seen.friends_going.map((p: { id: string }) => p.id)).toEqual([sam]);
    expect(seen.going_count).toBe(3);

    const nearby = (await ctx.as(me, { method: "GET", url: `/events/nearby?lat=${LONDON.lat}&lng=${LONDON.lng}` })).json();
    expect(nearby.events[0].friends_going_count).toBe(1);

    const hosts = (await ctx.as(host, { method: "GET", url: `/events/${ev.id}` })).json();
    expect(hosts.friends_going).toEqual([]);
  });
});

describe("party types and time filters", () => {
  it("filters nearby parties by kind and by time window", async () => {
    const host = await ctx.createUser();
    const me = await ctx.createUser();
    const music = await createEvent(host, { title: "Disco", interest_id: 1, starts_at: inHours(2) });
    const food = await createEvent(host, { title: "Supper club", interest_id: 4, starts_at: inHours(50) });
    await createEvent(host, { title: "Anything", starts_at: inHours(3) });
    expect(music.interest_id).toBe(1);

    const near = `lat=${LONDON.lat}&lng=${LONDON.lng}`;
    const titles = async (query: string) =>
      ((await ctx.as(me, { method: "GET", url: `/events/nearby?${near}&${query}` })).json().events as { title: string }[])
        .map((e) => e.title);
    expect(await titles("interest_id=1")).toEqual(["Disco"]);
    expect(await titles(`to=${encodeURIComponent(inHours(24))}`)).toEqual(["Disco", "Anything"]);
    expect(await titles(`from=${encodeURIComponent(inHours(40))}`)).toEqual(["Supper club"]);

    const edited = await ctx.as(host, { method: "PATCH", url: `/events/${food.id}`, payload: { interest_id: null } });
    expect(edited.json().interest_id).toBeNull();
    const bad = await ctx.as(host, { method: "PATCH", url: `/events/${food.id}`, payload: { interest_id: 999 } });
    expect(bad.statusCode).toBe(400);
  });
});
