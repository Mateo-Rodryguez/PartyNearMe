import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser } from "../../src/db.js";
import type { Moderator } from "../../src/worker/moderation.js";
import { memoryObjectStore } from "../../src/worker/objectStore.js";
import { processBatch } from "../../src/worker/worker.js";
import { useDbApp } from "./context.js";

const ctx = useDbApp();
const silent = { info: () => {}, error: () => {} };

let store: ReturnType<typeof memoryObjectStore>;
let flagImages: boolean;
const moderator: Moderator = {
  async check({ image }) {
    return image && flagImages ? { flagged: true, categories: ["sexual"] } : { flagged: false, categories: [] };
  },
};
const work = async () => {
  while ((await processBatch({ db: ctx.db, store, moderator, log: silent, pusher: null })) > 0);
};

beforeEach(() => {
  store = memoryObjectStore();
  flagImages = false;
});

/** Uploads a photo the way the phone does and returns its upload id. */
async function uploadPhoto(userId: string) {
  const res = await ctx.as(userId, { method: "POST", url: "/uploads", payload: { content_type: "image/jpeg", size_bytes: 1000 } });
  const u = res.json() as { upload_id: string; upload_url: string };
  const key = decodeURIComponent(new URL(u.upload_url).pathname).split("/").slice(2).join("/");
  await store.put(key, await sharp({ create: { width: 800, height: 800, channels: 3, background: "#cc3366" } }).jpeg().toBuffer(), "image/jpeg");
  return { id: u.upload_id, key };
}

const me = async (userId: string) => (await ctx.as(userId, { method: "GET", url: "/me" })).json() as { avatar_url: string | null };

describe("profile pictures", () => {
  it("shows a new picture once the worker has checked it, everywhere the person appears", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const photo = await uploadPhoto(alice);

    const res = await ctx.as(alice, { method: "PUT", url: "/me/avatar", payload: { upload_id: photo.id } });
    expect(res.statusCode, res.body).toBe(202);
    expect((await me(alice)).avatar_url).toBeNull();

    await work();
    const name = photo.key.split("/").pop()?.replace(/\.jpg$/, "");
    const base = `https://media.test/avatars/${alice}/${name}`;
    expect((await me(alice)).avatar_url).toBe(`${base}-640.webp`);
    expect((await ctx.as(bob, { method: "GET", url: `/users/${alice}` })).json().avatar_url).toBe(`${base}-640.webp`);
    expect(store.objects.has(photo.key)).toBe(false);

    const party = await ctx.as(alice, {
      method: "POST",
      url: "/events",
      payload: { title: "Party", starts_at: new Date(Date.now() + 86400000).toISOString(), lat: 0, lng: 0, publish: true },
    });
    expect(party.json().organiser.avatar_url).toBe(`${base}-150.webp`);
  });

  it("keeps the old picture when the new one is flagged, and deletes old files when replaced", async () => {
    const alice = await ctx.createUser();
    const first = await uploadPhoto(alice);
    await ctx.as(alice, { method: "PUT", url: "/me/avatar", payload: { upload_id: first.id } });
    await work();
    const firstUrl = (await me(alice)).avatar_url;
    const firstKeys = [...store.objects.keys()].filter((k) => k.startsWith("avatars/"));
    expect(firstKeys).toHaveLength(3);

    flagImages = true;
    const bad = await uploadPhoto(alice);
    await ctx.as(alice, { method: "PUT", url: "/me/avatar", payload: { upload_id: bad.id } });
    await work();
    expect((await me(alice)).avatar_url).toBe(firstUrl);
    expect(store.objects.has(bad.key)).toBe(false);

    flagImages = false;
    const second = await uploadPhoto(alice);
    await ctx.as(alice, { method: "PUT", url: "/me/avatar", payload: { upload_id: second.id } });
    await work();
    expect((await me(alice)).avatar_url).not.toBe(firstUrl);
    for (const k of firstKeys) expect(store.objects.has(k)).toBe(false);

    expect((await ctx.as(alice, { method: "DELETE", url: "/me/avatar" })).statusCode).toBe(204);
    await work();
    expect((await me(alice)).avatar_url).toBeNull();
    expect([...store.objects.keys()].filter((k) => k.startsWith("avatars/"))).toEqual([]);
  });

  it("won't take someone else's upload or one already used, and can't be set directly", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const photo = await uploadPhoto(alice);
    expect((await ctx.as(bob, { method: "PUT", url: "/me/avatar", payload: { upload_id: photo.id } })).statusCode).toBe(404);
    expect((await ctx.as(alice, { method: "PUT", url: "/me/avatar", payload: { upload_id: photo.id } })).statusCode).toBe(202);
    expect((await ctx.as(alice, { method: "PUT", url: "/me/avatar", payload: { upload_id: photo.id } })).statusCode).toBe(404);

    await expect(asUser(ctx.db, alice, (tx) => tx`update public.profiles set avatar_key = 'x' where id = ${alice}`))
      .rejects.toThrow(/permission denied/);
  });

  it("deletes the picture's files with the account", async () => {
    const alice = await ctx.createUser();
    await ctx.as(alice, { method: "PUT", url: "/me/avatar", payload: { upload_id: (await uploadPhoto(alice)).id } });
    await work();
    expect((await ctx.as(alice, { method: "DELETE", url: "/me" })).statusCode).toBe(204);
    await work();
    expect([...store.objects.keys()]).toEqual([]);
  });
});

describe("party covers", () => {
  const party = async (organiser: string) =>
    (await ctx.as(organiser, {
      method: "POST",
      url: "/events",
      payload: { title: "Rooftop", starts_at: new Date(Date.now() + 86400000).toISOString(), lat: 0, lng: 0, publish: true },
    })).json().id as string;

  it("lets the organiser set and remove a cover", async () => {
    const host = await ctx.createUser();
    const guest = await ctx.createUser();
    const eventId = await party(host);

    const notMine = await uploadPhoto(guest);
    expect((await ctx.as(guest, { method: "PUT", url: `/events/${eventId}/cover`, payload: { upload_id: notMine.id } })).statusCode).toBe(404);

    const photo = await uploadPhoto(host);
    expect((await ctx.as(host, { method: "PUT", url: `/events/${eventId}/cover`, payload: { upload_id: photo.id } })).statusCode).toBe(202);
    await work();
    const name = photo.key.split("/").pop()?.replace(/\.jpg$/, "");
    const seen = await ctx.as(guest, { method: "GET", url: `/events/${eventId}` });
    expect(seen.json().cover_url).toBe(`https://media.test/covers/${eventId}/${name}-1080.webp`);

    expect((await ctx.as(guest, { method: "DELETE", url: `/events/${eventId}/cover` })).statusCode).toBe(404);
    expect((await ctx.as(host, { method: "DELETE", url: `/events/${eventId}/cover` })).statusCode).toBe(204);
    await work();
    expect((await ctx.as(guest, { method: "GET", url: `/events/${eventId}` })).json().cover_url).toBeNull();
    expect([...store.objects.keys()].filter((k) => k.startsWith("covers/"))).toEqual([]);
  });

  it("deletes the cover's files with the party", async () => {
    const host = await ctx.createUser();
    const eventId = await party(host);
    await ctx.as(host, { method: "PUT", url: `/events/${eventId}/cover`, payload: { upload_id: (await uploadPhoto(host)).id } });
    await work();
    expect((await ctx.as(host, { method: "DELETE", url: `/events/${eventId}` })).statusCode).toBe(204);
    await work();
    expect([...store.objects.keys()]).toEqual([]);
  });
});
