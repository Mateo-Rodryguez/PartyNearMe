import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import type { Moderator } from "../../src/worker/moderation.js";
import { memoryObjectStore } from "../../src/worker/objectStore.js";
import { memoryPusher } from "../../src/worker/push.js";
import { MAX_ATTEMPTS, processBatch } from "../../src/worker/worker.js";
import { useDbApp } from "./context.js";

const ctx = useDbApp();
const silent = { info: () => {}, error: () => {} };

let store: ReturnType<typeof memoryObjectStore>;
let push: ReturnType<typeof memoryPusher>;
let flagCaption: string | null;
let flagImages: boolean;
const moderator: Moderator = {
  async check({ text, image }) {
    if (text && flagCaption && text.includes(flagCaption)) return { flagged: true, categories: ["harassment"] };
    if (image && flagImages) return { flagged: true, categories: ["sexual"] };
    return { flagged: false, categories: [] };
  },
};
const deps = () => ({ db: ctx.db, store, moderator, log: silent, pusher: push.pusher });

beforeEach(async () => {
  store = memoryObjectStore();
  push = memoryPusher(new Set(["dead-token-123"]));
  flagCaption = null;
  flagImages = false;
});

const jpeg = () =>
  sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();

/** Creates a post through the API and puts its photos in storage, as the phone would. */
async function createPost(userId: string, caption = "hello", photos = 2, upload = true, tagIds?: string[]) {
  const ids: string[] = [];
  const keys: string[] = [];
  for (let i = 0; i < photos; i++) {
    const res = await ctx.as(userId, { method: "POST", url: "/uploads", payload: { content_type: "image/jpeg", size_bytes: 1000 } });
    const u = res.json() as { upload_id: string; upload_url: string };
    const key = decodeURIComponent(new URL(u.upload_url).pathname).split("/").slice(2).join("/");
    if (upload) await store.put(key, await jpeg(), "image/jpeg");
    ids.push(u.upload_id);
    keys.push(key);
  }
  const res = await ctx.as(userId, { method: "POST", url: "/posts", payload: { upload_ids: ids, caption, tag_ids: tagIds } });
  expect(res.statusCode, res.body).toBe(201);
  return { id: (res.json() as { id: string }).id, keys };
}

const outbox = () => ctx.db<{ topic: string; attempts: number; processed_at: Date | null; last_error: string | null }[]>`
  select topic, attempts, processed_at, last_error from public.outbox order by id`;

describe("photo worker", () => {
  it("makes the feed sizes, publishes the post and deletes the originals", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const post = await createPost(alice);

    expect(await processBatch(deps())).toBe(1);

    for (const key of post.keys) expect(store.objects.has(key)).toBe(false);
    for (const position of [0, 1]) {
      for (const size of [150, 640, 1080]) {
        const obj = store.objects.get(`media/${post.id}/${position}-${size}.webp`);
        expect(obj?.contentType).toBe("image/webp");
      }
    }
    const [row] = await outbox();
    expect(row).toMatchObject({ attempts: 1, last_error: null });
    expect(row?.processed_at).not.toBeNull();

    const res = await ctx.as(bob, { method: "GET", url: `/posts/${post.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; media: { url: string; width: number; height: number; blurhash: string }[] };
    expect(body.status).toBe("visible");
    expect(body.media[0]).toMatchObject({ url: `https://media.test/media/${post.id}/0-1080.webp`, width: 1080, height: 810 });
    expect(body.media[0]?.blurhash).toBeTruthy();
  });

  it("hides posts the moderator flags and records why", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    flagCaption = "nasty";
    const byCaption = await createPost(alice, "something nasty", 1);
    await processBatch(deps());
    flagCaption = null;
    flagImages = true;
    const byPhoto = await createPost(alice, "fine", 1);
    await processBatch(deps());

    const rows = await ctx.db`select id, status, moderation_labels from public.posts order by created_at`;
    expect(rows.map((r) => [r.id, r.status, r.moderation_labels])).toEqual([
      [byCaption.id, "hidden", ["harassment"]],
      [byPhoto.id, "hidden", ["sexual"]],
    ]);
    expect((await ctx.as(bob, { method: "GET", url: `/posts/${byPhoto.id}` })).statusCode).toBe(404);
  });

  it("retries when a photo hasn't arrived, then gives up after the limit", async () => {
    const alice = await ctx.createUser();
    await createPost(alice, "hello", 1, false);

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      // Expire the lease so the next batch can pick the event up again straight away.
      await ctx.db`update public.outbox set locked_until = null`;
      expect(await processBatch(deps())).toBe(1);
      const [row] = await outbox();
      expect(row).toMatchObject({ attempts: i, processed_at: null });
      expect(row?.last_error).toMatch(/not uploaded yet/);
    }
    expect(await processBatch(deps())).toBe(0);
    const [post] = await ctx.db`select status from public.posts`;
    expect(post?.status).toBe("pending");
  });

  it("does not hand the same event to two workers at once", async () => {
    const alice = await ctx.createUser();
    await createPost(alice, "hello", 1, false);
    expect(await processBatch(deps())).toBe(1);
    // The failed attempt released its lease, so take it again and hold it.
    await ctx.db`update public.outbox set locked_until = now() + interval '5 minutes'`;
    expect(await processBatch(deps())).toBe(0);
  });

  it("removes every size from storage when a post is deleted", async () => {
    const alice = await ctx.createUser();
    const post = await createPost(alice, "bye", 1);
    await processBatch(deps());
    expect(store.objects.size).toBe(3);

    expect((await ctx.as(alice, { method: "DELETE", url: `/posts/${post.id}` })).statusCode).toBe(204);
    await processBatch(deps());
    expect(store.objects.size).toBe(0);
    expect((await outbox()).every((r) => r.processed_at !== null)).toBe(true);
  });
});

describe("push notifications", () => {
  const register = (userId: string, token: string) =>
    ctx.as(userId, { method: "PUT", url: `/devices/${token}`, payload: { platform: "android" } });
  const drain = async () => {
    while ((await processBatch(deps())) > 0);
  };

  it("notifies the other person about a new message, on all their phones", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await ctx.db`update public.profiles set display_name = 'Alice' where id = ${alice}`;
    await register(alice, "alice-phone-1");
    await register(bob, "bob-phone-1");
    await register(bob, "bob-tablet-1");
    const c = (await ctx.as(alice, { method: "POST", url: "/conversations", payload: { user_id: bob } })).json() as { id: string };
    await ctx.as(alice, { method: "POST", url: `/conversations/${c.id}/messages`, payload: { body: "x".repeat(150) } });
    await drain();

    expect(push.sent.map((s) => s.token).sort()).toEqual(["bob-phone-1", "bob-tablet-1"]);
    expect(push.sent[0]?.message).toMatchObject({ title: "Alice", data: { type: "message", conversation_id: c.id } });
    expect(push.sent[0]?.message.body).toHaveLength(100);
  });

  it("skips the kinds of push the user turned off in settings", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await register(bob, "bob-phone-1");
    await ctx.as(bob, { method: "PATCH", url: "/me/settings", payload: { push_messages: false } });
    const c = (await ctx.as(alice, { method: "POST", url: "/conversations", payload: { user_id: bob } })).json() as { id: string };
    await ctx.as(alice, { method: "POST", url: `/conversations/${c.id}/messages`, payload: { body: "hi" } });
    await drain();
    expect(push.sent).toEqual([]);
  });

  it("forgets phones Firebase says are gone", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await register(bob, "dead-token-123");
    const c = (await ctx.as(alice, { method: "POST", url: "/conversations", payload: { user_id: bob } })).json() as { id: string };
    await ctx.as(alice, { method: "POST", url: `/conversations/${c.id}/messages`, payload: { body: "hi" } });
    await drain();
    expect(await ctx.db`select token from public.device_tokens`).toHaveLength(0);
  });

  it("tells organisers who is going, once per person", async () => {
    const organiser = await ctx.createUser();
    const guest = await ctx.createUser();
    await register(organiser, "organiser-phone");
    await register(guest, "guest-phone-1");
    const ev = (await ctx.as(organiser, {
      method: "POST",
      url: "/events",
      payload: { title: "Rooftop", starts_at: new Date(Date.now() + 86400_000).toISOString(), lat: 51.5, lng: -0.12, publish: true },
    })).json() as { id: string };

    const rsvp = (userId: string, status: string) =>
      ctx.as(userId, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status } });
    await rsvp(guest, "interested");
    await rsvp(guest, "going");
    await rsvp(guest, "going");
    await rsvp(organiser, "going"); // their own RSVP needs no alert
    await drain();

    expect(push.sent.map((s) => [s.token, s.message.title, s.message.data.type])).toEqual([
      ["organiser-phone", "Rooftop", "rsvp"],
    ]);
  });

  it("reminds people going to or interested in an event shortly before it starts, once", async () => {
    const organiser = await ctx.createUser();
    const guest = await ctx.createUser();
    const maybe = await ctx.createUser();
    await register(guest, "guest-phone-1");
    await register(maybe, "maybe-phone-1");
    const create = async (hours: number) =>
      ((await ctx.as(organiser, {
        method: "POST",
        url: "/events",
        payload: { title: `In ${hours}h`, starts_at: new Date(Date.now() + hours * 3600_000).toISOString(), lat: 51.5, lng: -0.12, publish: true },
      })).json() as { id: string }).id;
    const soon = await create(1);
    const later = await create(5);
    for (const id of [soon, later]) {
      await ctx.as(guest, { method: "PUT", url: `/events/${id}/rsvp`, payload: { status: "going" } });
      await ctx.as(maybe, { method: "PUT", url: `/events/${id}/rsvp`, payload: { status: "interested" } });
    }
    // Several worker passes: the reminder still goes out only once.
    await drain();
    await drain();
    await drain();
    const reminders = push.sent.filter((s) => s.message.data.type === "event_reminder");
    expect(reminders.map((s) => [s.token, s.message.title])).toEqual([["guest-phone-1", "In 1h"], ["maybe-phone-1", "In 1h"]]);
    expect(reminders[0]?.message.body).toMatch(/^Starts in (59|60) min$/);
    expect(reminders[1]?.message.body).toMatch(/^Still thinking about it\? Starts in (59|60) min$/);
  });

  it("skips alerts but finishes the work when Firebase isn't set up", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    const c = (await ctx.as(alice, { method: "POST", url: "/conversations", payload: { user_id: bob } })).json() as { id: string };
    await ctx.as(alice, { method: "POST", url: `/conversations/${c.id}/messages`, payload: { body: "hi" } });
    while ((await processBatch({ ...deps(), pusher: null })) > 0);
    const rows = await ctx.db`select processed_at from public.outbox`;
    expect(rows.every((r) => r.processed_at !== null)).toBe(true);
  });
});

describe("comments, captions and cancellations", () => {
  const register = (userId: string, token: string) =>
    ctx.as(userId, { method: "PUT", url: `/devices/${token}`, payload: { platform: "android" } });
  const drain = async () => {
    while ((await processBatch(deps())) > 0);
  };
  const visiblePost = async (authorId: string, caption: string | null = null) => {
    const [row] = await ctx.db<{ id: string }[]>`
      insert into public.posts (author_id, status, caption) values (${authorId}, 'visible', ${caption}) returning id
    `;
    return row?.id ?? "";
  };

  it("tells the post's author about a comment, unless they turned it off", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await ctx.db`update public.profiles set display_name = 'Bob' where id = ${bob}`;
    await register(alice, "alice-phone");
    const post = await visiblePost(alice);
    await ctx.as(bob, { method: "POST", url: `/posts/${post}/comments`, payload: { body: "what a night" } });
    await drain();
    expect(push.sent.map((s) => s.message)).toEqual([
      { title: "Bob commented", body: "what a night", data: { type: "comment", post_id: post } },
    ]);

    await ctx.as(alice, { method: "PATCH", url: "/me/settings", payload: { push_comments: false } });
    await ctx.as(bob, { method: "POST", url: `/posts/${post}/comments`, payload: { body: "again" } });
    await drain();
    expect(push.sent).toHaveLength(1);
  });

  it("tells tagged people once the post is checked, and only once", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await ctx.db`update public.profiles set display_name = 'Alice' where id = ${alice}`;
    await register(bob, "bob-phone-1");
    const post = await createPost(alice, "hello", 1, true, [bob]);
    await drain();
    expect(push.sent.map((s) => s.message)).toEqual([
      { title: "Alice tagged you", body: "in a photo", data: { type: "tag", post_id: post.id } },
    ]);
    // Tagging again later doesn't repeat it; a newly tagged person hears.
    const carol = await ctx.createUser();
    await register(carol, "carol-phone-1");
    await ctx.as(alice, { method: "PUT", url: `/posts/${post.id}/tags`, payload: { user_ids: [bob, carol] } });
    await drain();
    expect(push.sent.map((s) => s.token)).toEqual(["bob-phone-1", "carol-phone-1"]);
  });

  it("doesn't tell tagged people about a post that fails moderation", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await register(bob, "bob-phone-1");
    flagCaption = "nasty";
    await createPost(alice, "nasty", 1, true, [bob]);
    await drain();
    expect(push.sent).toEqual([]);
  });

  it("hides comments that fail moderation, without telling anyone", async () => {
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();
    await register(alice, "alice-phone");
    const post = await visiblePost(alice);
    flagCaption = "nasty";
    await ctx.as(bob, { method: "POST", url: `/posts/${post}/comments`, payload: { body: "something nasty" } });
    await drain();
    expect(await ctx.db`select status from public.comments`).toEqual([{ status: "hidden" }]);
    expect(await ctx.db`select comment_count from public.posts where id = ${post}`).toEqual([{ comment_count: 0 }]);
    expect(push.sent).toEqual([]);
  });

  it("checks edited captions again", async () => {
    const alice = await ctx.createUser();
    const post = await visiblePost(alice, "fine");
    flagCaption = "nasty";
    await ctx.as(alice, { method: "PATCH", url: `/posts/${post}`, payload: { caption: "now nasty" } });
    await drain();
    expect(await ctx.db`select status, moderation_labels from public.posts`).toEqual([
      { status: "hidden", moderation_labels: ["harassment"] },
    ]);
  });

  it("tells guests when a party is cancelled", async () => {
    const organiser = await ctx.createUser();
    const guest = await ctx.createUser();
    const maybe = await ctx.createUser();
    await register(organiser, "organiser-phone");
    await register(guest, "guest-phone");
    await register(maybe, "maybe-phone");
    const ev = (await ctx.as(organiser, {
      method: "POST",
      url: "/events",
      payload: { title: "Rooftop", starts_at: new Date(Date.now() + 86400_000).toISOString(), lat: 51.5, lng: -0.12, publish: true },
    })).json() as { id: string };
    await ctx.as(guest, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status: "going" } });
    await ctx.as(maybe, { method: "PUT", url: `/events/${ev.id}/rsvp`, payload: { status: "interested" } });
    await drain();
    push.sent.length = 0;

    await ctx.as(organiser, { method: "PATCH", url: `/events/${ev.id}`, payload: { status: "cancelled" } });
    await drain();
    expect(push.sent.map((s) => [s.token, s.message.body]).sort()).toEqual([
      ["guest-phone", "This party has been cancelled"],
      ["maybe-phone", "This party has been cancelled"],
    ]);
  });
});
