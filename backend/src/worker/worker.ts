import type { Db } from "../db.js";
import { processImage, SIZES } from "./images.js";
import type { Moderator } from "./moderation.js";
import type { ObjectStore } from "./objectStore.js";

export const MAX_ATTEMPTS = 5;
const LEASE = "5 minutes";
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

export interface WorkerDeps {
  /** Connects as the database owner / service role: the worker is trusted and bypasses RLS. */
  db: Db;
  store: ObjectStore;
  moderator: Moderator;
  log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
}

interface OutboxRow {
  id: number;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Claims a batch of pending outbox rows with a lease, so parallel workers never share one. */
async function claim(db: Db, limit: number): Promise<OutboxRow[]> {
  return db<OutboxRow[]>`
    update public.outbox o
    set attempts = o.attempts + 1, locked_until = now() + ${LEASE}::interval
    where o.id in (
      select id from public.outbox
      where processed_at is null
        and attempts < ${MAX_ATTEMPTS}
        and (locked_until is null or locked_until < now())
      order by id
      limit ${limit}
      for update skip locked
    )
    returning o.id, o.topic, o.payload, o.attempts
  `;
}

/** Processes one batch; returns how many rows it claimed (0 means idle). */
export async function processBatch(deps: WorkerDeps, limit = 5): Promise<number> {
  const rows = await claim(deps.db, limit);
  for (const row of rows) {
    try {
      await handle(deps, row);
      await deps.db`update public.outbox set processed_at = now(), locked_until = null, last_error = null where id = ${row.id}`;
      deps.log.info({ id: row.id, topic: row.topic }, "outbox event processed");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.db`update public.outbox set locked_until = null, last_error = ${message} where id = ${row.id}`;
      deps.log.error({ id: row.id, topic: row.topic, attempt: row.attempts, err: message }, "outbox event failed");
    }
  }
  return rows.length;
}

async function handle(deps: WorkerDeps, row: OutboxRow): Promise<void> {
  switch (row.topic) {
    case "post.created":
      return processPost(deps, String(row.payload.post_id));
    case "media.deleted":
      return deleteMedia(deps, row.payload as { storage_key: string; variants?: Record<string, string> });
    default:
      // Unknown topics are left for a future worker version rather than failing.
      deps.log.info({ id: row.id, topic: row.topic }, "no handler for topic");
  }
}

/**
 * Makes the feed sizes for every photo of a new post, checks photos and
 * caption with the moderator, then publishes or hides the post. Safe to run
 * again after a partial failure: outputs are written to fixed keys.
 */
async function processPost({ db, store, moderator }: WorkerDeps, postId: string): Promise<void> {
  const [post] = await db<{ id: string; caption: string | null; status: string }[]>`
    select id, caption, status from public.posts where id = ${postId}
  `;
  // Deleted before we got to it, or already handled.
  if (!post || post.status !== "pending") return;

  const media = await db<{ id: string; position: number; storage_key: string }[]>`
    select id, position, storage_key from public.post_media where post_id = ${postId} order by position
  `;

  const flaggedCategories = new Set<string>();
  const captionCheck = await moderator.check({ text: post.caption });
  captionCheck.categories.forEach((c) => flaggedCategories.add(c));
  let flagged = captionCheck.flagged;

  const processed: { id: string; original: string; key: string; width: number; height: number; blurhash: string; variants: Record<string, string> }[] = [];
  for (const m of media) {
    const prefix = `media/${postId}/${m.position}`;
    const finalKey = `${prefix}-1080.webp`;
    const original = await store.get(m.storage_key);
    if (!original) throw new Error(`photo not uploaded yet: ${m.storage_key}`);
    if (original.body.length > MAX_ORIGINAL_BYTES) throw new Error(`photo too large: ${m.storage_key}`);

    const image = await processImage(original.body);
    const variants: Record<string, string> = {};
    for (const size of SIZES) {
      const key = `${prefix}-${size}.webp`;
      await store.put(key, image.variants[size], "image/webp");
      variants[String(size)] = key;
    }

    const check = await moderator.check({ image: { body: image.variants[640], contentType: "image/webp" } });
    flagged ||= check.flagged;
    check.categories.forEach((c) => flaggedCategories.add(c));

    processed.push({ id: m.id, original: m.storage_key, key: finalKey, width: image.width, height: image.height, blurhash: image.blurhash, variants });
  }

  await db.begin(async (tx) => {
    for (const p of processed) {
      await tx`
        update public.post_media
        set storage_key = ${p.key}, width = ${p.width}, height = ${p.height},
            blurhash = ${p.blurhash}, variants = ${tx.json(p.variants)}
        where id = ${p.id}
      `;
    }
    await tx`
      update public.posts
      set status = ${flagged ? "hidden" : "visible"},
          moderation_labels = ${flagged ? [...flaggedCategories] : null}
      where id = ${postId} and status = 'pending'
    `;
  });

  // Originals may carry GPS and camera metadata; only the cleaned sizes are kept.
  for (const p of processed) await store.delete(p.original);
}

async function deleteMedia({ store }: WorkerDeps, payload: { storage_key: string; variants?: Record<string, string> }) {
  const keys = new Set([payload.storage_key, ...Object.values(payload.variants ?? {})]);
  for (const key of keys) await store.delete(key);
}

/** Runs until stopped, polling when there's nothing to do. */
export function startWorker(deps: WorkerDeps, opts: { idleMs?: number } = {}) {
  let stopping = false;
  const done = (async () => {
    while (!stopping) {
      let claimed = 0;
      try {
        claimed = await processBatch(deps);
      } catch (err) {
        deps.log.error({ err: err instanceof Error ? err.message : String(err) }, "worker batch failed");
      }
      if (claimed === 0 && !stopping) await new Promise((r) => setTimeout(r, opts.idleMs ?? 2000));
    }
  })();
  return {
    stop: async () => {
      stopping = true;
      await done;
    },
  };
}
