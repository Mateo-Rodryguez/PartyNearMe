import type { Db, Tx } from "../db.js";
import { HttpError } from "../errors.js";

export type PictureSize = "150" | "640" | "1080";

/**
 * SQL for the URL of one size of a profile picture or party cover, given the
 * column holding its sizes (e.g. "a.avatar_variants"). Null when there is no
 * picture yet or media serving isn't configured.
 */
export const pictureUrl = (tx: Tx | Db, base: string | undefined, column: string, size: PictureSize) =>
  base ? tx`(${base}::text || '/' || (${tx(column)} ->> ${size}::text))` : tx`null::text`;

/**
 * Takes one of the user's fresh uploads and queues it for the worker, which
 * checks it and then sets it as the picture. Runs as the owner: users can't
 * mark uploads used or write to the outbox themselves.
 */
export async function queuePicture(
  db: Db,
  me: string,
  uploadId: string,
  target: { kind: "avatar" | "cover"; target_id: string },
): Promise<void> {
  await db.begin(async (tx) => {
    const [upload] = await tx<{ storage_key: string }[]>`
      update public.uploads set used_at = now()
      where id = ${uploadId} and user_id = ${me} and used_at is null and created_at > now() - interval '1 day'
      returning storage_key
    `;
    if (!upload) throw new HttpError(404, "Photo not found or already used");
    await tx`
      insert into public.outbox (topic, payload)
      values ('image.uploaded', ${tx.json({ ...target, storage_key: upload.storage_key })})
    `;
  });
}

/** Clears a picture and queues its files for deletion. Runs as the owner. */
export async function clearPicture(db: Db, target: { kind: "avatar" | "cover"; target_id: string }): Promise<void> {
  await db.begin(async (tx) => {
    const [old] = target.kind === "avatar"
      ? await tx<{ key: string | null; variants: Record<string, string> | null }[]>`
          update public.profiles p set avatar_key = null, avatar_variants = null
          from (select avatar_key, avatar_variants from public.profiles where id = ${target.target_id} for update) old
          where p.id = ${target.target_id}
          returning old.avatar_key as key, old.avatar_variants as variants`
      : await tx<{ key: string | null; variants: Record<string, string> | null }[]>`
          update public.events e set cover_key = null, cover_variants = null
          from (select cover_key, cover_variants from public.events where id = ${target.target_id} for update) old
          where e.id = ${target.target_id}
          returning old.cover_key as key, old.cover_variants as variants`;
    if (old?.key) {
      await tx`
        insert into public.outbox (topic, payload)
        values ('media.deleted', ${tx.json({ storage_key: old.key, variants: old.variants ?? {} })})
      `;
    }
  });
}
