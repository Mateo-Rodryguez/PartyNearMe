import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import type { Moderator } from "../../src/worker/moderation.js";
import { memoryObjectStore } from "../../src/worker/objectStore.js";
import { MAX_ATTEMPTS, processBatch } from "../../src/worker/worker.js";
import { useDbApp } from "./context.js";

const ctx = useDbApp();
const silent = { info: () => {}, error: () => {} };

let store: ReturnType<typeof memoryObjectStore>;
let flagCaption: string | null;
let flagImages: boolean;
const moderator: Moderator = {
  async check({ text, image }) {
    if (text && flagCaption && text.includes(flagCaption)) return { flagged: true, categories: ["harassment"] };
    if (image && flagImages) return { flagged: true, categories: ["sexual"] };
    return { flagged: false, categories: [] };
  },
};
const deps = () => ({ db: ctx.db, store, moderator, log: silent });

beforeEach(async () => {
  store = memoryObjectStore();
  flagCaption = null;
  flagImages = false;
});

const jpeg = () =>
  sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();

/** Creates a post through the API and puts its photos in storage, as the phone would. */
async function createPost(userId: string, caption = "hello", photos = 2, upload = true) {
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
  const res = await ctx.as(userId, { method: "POST", url: "/posts", payload: { upload_ids: ids, caption } });
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
