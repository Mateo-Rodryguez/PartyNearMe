import type { Db } from "../db.js";
import { processImage, SIZES } from "./images.js";
import type { Moderator } from "./moderation.js";
import type { ObjectStore } from "./objectStore.js";
import type { PushMessage, Pusher } from "./push.js";

export const MAX_ATTEMPTS = 5;
const LEASE = "5 minutes";
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
/** How far ahead of an event its "starting soon" reminder goes out. */
const REMINDER_LEAD = "2 hours";
const PREVIEW_CHARS = 100;

export interface WorkerDeps {
  /** Connects as the database owner / service role: the worker is trusted and bypasses RLS. */
  db: Db;
  store: ObjectStore;
  moderator: Moderator;
  /** Null until Firebase is configured; notifications are then skipped. */
  pusher: Pusher | null;
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
  await queueReminders(deps.db);
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
    case "image.uploaded":
      return processPicture(deps, row.payload as unknown as PicturePayload);
    case "media.deleted":
      return deleteMedia(deps, row.payload as { storage_key: string; variants?: Record<string, string> });
    case "message.created":
      return notifyMessage(deps, String(row.payload.message_id));
    case "rsvp.going":
      return notifyRsvp(deps, String(row.payload.event_id), String(row.payload.user_id));
    case "event.reminder":
      return notifyReminder(deps, String(row.payload.event_id));
    case "event.cancelled":
      return notifyCancelled(deps, String(row.payload.event_id));
    case "comment.created":
      return processComment(deps, String(row.payload.comment_id));
    case "post.caption_changed":
      return recheckCaption(deps, String(row.payload.post_id));
    case "post.tagged":
      return notifyTags(deps, String(row.payload.post_id));
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
async function processPost(deps: WorkerDeps, postId: string): Promise<void> {
  const { db, store, moderator } = deps;
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
  // People tagged while the post was being checked hear about it now.
  if (!flagged) await notifyTags(deps, postId);
}

interface PicturePayload {
  kind: "avatar" | "cover";
  /** The profile or event the picture is for. */
  target_id: string;
  storage_key: string;
}

/**
 * Makes the sizes of a new profile picture or party cover and checks it with
 * the moderator. A clean picture replaces the old one, whose files are then
 * deleted; a flagged one is thrown away and the old picture stays. Safe to
 * run again: outputs go to keys named after the upload.
 */
async function processPicture({ db, store, moderator, log }: WorkerDeps, p: PicturePayload): Promise<void> {
  const original = await store.get(p.storage_key);
  if (!original) throw new Error(`photo not uploaded yet: ${p.storage_key}`);
  if (original.body.length > MAX_ORIGINAL_BYTES) throw new Error(`photo too large: ${p.storage_key}`);

  const image = await processImage(original.body);
  const check = await moderator.check({ image: { body: image.variants[640], contentType: "image/webp" } });
  if (check.flagged) {
    log.info({ kind: p.kind, target_id: p.target_id, categories: check.categories }, "picture rejected by moderation");
    await store.delete(p.storage_key);
    return;
  }

  const name = (p.storage_key.split("/").pop() ?? "picture").replace(/\.[^.]+$/, "");
  const prefix = `${p.kind === "avatar" ? "avatars" : "covers"}/${p.target_id}/${name}`;
  const variants: Record<string, string> = {};
  for (const size of SIZES) {
    await store.put(`${prefix}-${size}.webp`, image.variants[size], "image/webp");
    variants[String(size)] = `${prefix}-${size}.webp`;
  }
  // Profiles show the middle size; covers fill the screen width.
  const key = `${prefix}-${p.kind === "avatar" ? 640 : 1080}.webp`;

  type Old = { key: string | null; variants: Record<string, string> | null };
  const old = await db.begin(async (tx) => {
    const [row] = p.kind === "avatar"
      ? await tx<Old[]>`select avatar_key as key, avatar_variants as variants from public.profiles where id = ${p.target_id} for update`
      : await tx<Old[]>`select cover_key as key, cover_variants as variants from public.events where id = ${p.target_id} for update`;
    if (!row) return null;
    if (p.kind === "avatar") {
      await tx`update public.profiles set avatar_key = ${key}, avatar_variants = ${tx.json(variants)} where id = ${p.target_id}`;
    } else {
      await tx`update public.events set cover_key = ${key}, cover_variants = ${tx.json(variants)} where id = ${p.target_id}`;
    }
    return row;
  });

  const ours = new Set(Object.values(variants));
  // The account or party was deleted meanwhile, so nothing should keep the new files.
  const unused = old === null
    ? [...ours]
    : [old.key, ...Object.values(old.variants ?? {})].filter((k): k is string => k !== null && !ours.has(k));
  for (const k of new Set(unused)) await store.delete(k);
  // Like post photos, the original may carry GPS and camera metadata.
  await store.delete(p.storage_key);
}

async function deleteMedia({ store }: WorkerDeps, payload: { storage_key: string; variants?: Record<string, string> }) {
  const keys = new Set([payload.storage_key, ...Object.values(payload.variants ?? {})]);
  for (const key of keys) await store.delete(key);
}

/** Queues one reminder per published event once it is within REMINDER_LEAD of starting. */
async function queueReminders(db: Db): Promise<void> {
  await db`
    with due as (
      update public.events set reminder_queued_at = now()
      where status = 'published' and reminder_queued_at is null
        and starts_at between now() and now() + ${REMINDER_LEAD}::interval
      returning id
    )
    insert into public.outbox (topic, payload)
    select 'event.reminder', jsonb_build_object('event_id', id) from due
  `;
}

const preview = (text: string) => (text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1)}…` : text);
const nameOf = (p: { display_name: string | null; username: string | null }) =>
  p.display_name ?? p.username ?? "Someone";

/**
 * Sends to every device of the given users. Push is best effort: a failed
 * send is logged rather than retried, so nobody gets the same alert twice.
 */
/** The setting in user_settings that turns each kind of push off. */
type PushSetting = "push_messages" | "push_rsvps" | "push_reminders" | "push_comments";

async function pushTo(
  { db, pusher, log }: WorkerDeps,
  userIds: string[],
  setting: PushSetting,
  message: PushMessage,
): Promise<void> {
  if (userIds.length === 0) return;
  if (!pusher) {
    log.info({ users: userIds.length, type: message.data.type }, "push skipped: Firebase not configured");
    return;
  }
  // No settings row means the defaults, which have every kind on.
  const devices = await db<{ token: string }[]>`
    select d.token from public.device_tokens d
    left join public.user_settings s on s.user_id = d.user_id
    where d.user_id = any (${userIds}::uuid[]) and coalesce(s.${db(setting)}, true)
  `;
  for (const { token } of devices) {
    try {
      if (!(await pusher.send(token, message))) {
        await db`delete from public.device_tokens where token = ${token}`;
      }
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err), type: message.data.type }, "push failed");
    }
  }
}

async function notifyMessage(deps: WorkerDeps, messageId: string): Promise<void> {
  const [m] = await deps.db<{ conversation_id: string; sender_id: string; body: string; display_name: string | null; username: string | null; party: string | null }[]>`
    select m.conversation_id, m.sender_id, m.body, p.display_name, p.username, e.title as party
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    join public.conversations c on c.id = m.conversation_id
    left join public.events e on e.id = c.event_id
    where m.id = ${messageId}
  `;
  if (!m) return;
  // In party chats, people who blocked the sender don't hear from them.
  const recipients = await deps.db<{ user_id: string }[]>`
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = ${m.conversation_id} and cm.user_id <> ${m.sender_id}
      and not exists (select 1 from public.blocks b where b.blocker_id = cm.user_id and b.blocked_id = ${m.sender_id})
  `;
  await pushTo(deps, recipients.map((r) => r.user_id), "push_messages", {
    title: m.party ?? nameOf(m),
    body: preview(m.party ? `${nameOf(m)}: ${m.body}` : m.body),
    data: { type: "message", conversation_id: m.conversation_id },
  });
}

async function notifyRsvp(deps: WorkerDeps, eventId: string, userId: string): Promise<void> {
  const [row] = await deps.db<{ organiser_id: string; title: string; display_name: string | null; username: string | null }[]>`
    select e.organiser_id, e.title, p.display_name, p.username
    from public.events e, public.profiles p
    where e.id = ${eventId} and p.id = ${userId} and e.organiser_id <> ${userId}
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = e.organiser_id and b.blocked_id = ${userId})
                         or (b.blocker_id = ${userId} and b.blocked_id = e.organiser_id))
  `;
  if (!row) return;
  await pushTo(deps, [row.organiser_id], "push_rsvps", {
    title: row.title,
    body: `${nameOf(row)} is going`,
    data: { type: "rsvp", event_id: eventId, user_id: userId },
  });
}

async function notifyReminder(deps: WorkerDeps, eventId: string): Promise<void> {
  const [event] = await deps.db<{ title: string; venue_name: string | null; starts_at: Date }[]>`
    select title, venue_name, starts_at from public.events where id = ${eventId} and status = 'published'
  `;
  if (!event) return;
  const guests = await deps.db<{ user_id: string; status: string }[]>`
    select user_id, status from public.rsvps where event_id = ${eventId} and status in ('going', 'interested')
  `;
  const minutes = Math.max(0, Math.round((event.starts_at.getTime() - Date.now()) / 60_000));
  const when = minutes <= 90 ? `in ${minutes} min` : `in about ${Math.round(minutes / 60)} h`;
  const starts = event.venue_name ? `Starts ${when} at ${event.venue_name}` : `Starts ${when}`;
  const data = { type: "event_reminder", event_id: eventId };
  await pushTo(deps, guests.filter((g) => g.status === "going").map((g) => g.user_id), "push_reminders", {
    title: event.title,
    body: starts,
    data,
  });
  // People who were only "interested" get a nudge to make up their mind.
  await pushTo(deps, guests.filter((g) => g.status === "interested").map((g) => g.user_id), "push_reminders", {
    title: event.title,
    body: `Still thinking about it? ${starts}`,
    data,
  });
}

async function notifyCancelled(deps: WorkerDeps, eventId: string): Promise<void> {
  const [event] = await deps.db<{ title: string; organiser_id: string }[]>`
    select title, organiser_id from public.events where id = ${eventId} and status = 'cancelled'
  `;
  if (!event) return;
  const guests = await deps.db<{ user_id: string }[]>`
    select user_id from public.rsvps where event_id = ${eventId} and user_id <> ${event.organiser_id}
  `;
  await pushTo(deps, guests.map((g) => g.user_id), "push_reminders", {
    title: event.title,
    body: "This party has been cancelled",
    data: { type: "event_cancelled", event_id: eventId },
  });
}

/**
 * Checks a new comment's text and hides it if it isn't allowed; otherwise lets
 * the post's author know. Comments show before this runs, like on Instagram.
 */
async function processComment(deps: WorkerDeps, commentId: string): Promise<void> {
  const { db, moderator, log } = deps;
  const [c] = await db<{ body: string; post_id: string; post_author_id: string; author_id: string; status: string; display_name: string | null; username: string | null }[]>`
    select c.body, c.post_id, p.author_id as post_author_id, c.author_id, c.status, a.display_name, a.username
    from public.comments c
    join public.posts p on p.id = c.post_id
    join public.profiles a on a.id = c.author_id
    where c.id = ${commentId}
  `;
  if (!c || c.status !== "visible") return;
  const check = await moderator.check({ text: c.body });
  if (check.flagged) {
    await db`update public.comments set status = 'hidden' where id = ${commentId} and status = 'visible'`;
    log.info({ comment_id: commentId, categories: check.categories }, "comment hidden by moderation");
    return;
  }
  if (c.post_author_id === c.author_id) return;
  const [blocked] = await db`
    select 1 from public.blocks
    where (blocker_id = ${c.post_author_id} and blocked_id = ${c.author_id})
       or (blocker_id = ${c.author_id} and blocked_id = ${c.post_author_id})
  `;
  if (blocked) return;
  await pushTo(deps, [c.post_author_id], "push_comments", {
    title: `${nameOf(c)} commented`,
    body: preview(c.body),
    data: { type: "comment", post_id: c.post_id },
  });
}

/**
 * Tells people they were tagged, once the post is visible. Each tag is pushed
 * at most once (notified_at), whichever of processPost and the post.tagged
 * event gets there first.
 */
async function notifyTags(deps: WorkerDeps, postId: string): Promise<void> {
  const [post] = await deps.db<{ author_id: string; display_name: string | null; username: string | null }[]>`
    select p.author_id, a.display_name, a.username
    from public.posts p join public.profiles a on a.id = p.author_id
    where p.id = ${postId} and p.status = 'visible'
  `;
  if (!post) return;
  const tagged = await deps.db<{ user_id: string }[]>`
    update public.post_tags t set notified_at = now()
    where t.post_id = ${postId} and t.notified_at is null
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = t.user_id and b.blocked_id = ${post.author_id})
                         or (b.blocker_id = ${post.author_id} and b.blocked_id = t.user_id))
    returning t.user_id
  `;
  await pushTo(deps, tagged.map((t) => t.user_id), "push_comments", {
    title: `${nameOf(post)} tagged you`,
    body: "in a photo",
    data: { type: "tag", post_id: postId },
  });
}

/** An edited caption gets the same check as a new post's; a visible post is hidden if it fails. */
async function recheckCaption({ db, moderator, log }: WorkerDeps, postId: string): Promise<void> {
  const [post] = await db<{ caption: string | null; status: string }[]>`
    select caption, status from public.posts where id = ${postId}
  `;
  // Pending posts are checked in full, caption included, by processPost.
  if (!post?.caption || post.status !== "visible") return;
  const check = await moderator.check({ text: post.caption });
  if (!check.flagged) return;
  await db`
    update public.posts set status = 'hidden', moderation_labels = ${check.categories}
    where id = ${postId} and status = 'visible'
  `;
  log.info({ post_id: postId, categories: check.categories }, "post hidden after caption edit");
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
