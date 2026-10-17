import { z } from "zod";
import type { Tx } from "../../db.js";
import { pictureUrl } from "../media.js";

const media = z.object({
  position: z.number().int(),
  url: z.string().nullable(),
  thumbnails: z.record(z.string(), z.string()),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  blurhash: z.string().nullable(),
});

export const post = z.object({
  id: z.guid(),
  author: z.object({
    id: z.guid(),
    username: z.string().nullable(),
    display_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
  }),
  event_id: z.guid().nullable(),
  /** The party the post is from, when it has one the viewer can see. */
  event_title: z.string().nullable(),
  caption: z.string().nullable(),
  place_name: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  status: z.enum(["pending", "visible", "hidden", "removed"]),
  like_count: z.number().int(),
  liked_by_me: z.boolean(),
  media: z.array(media),
  created_at: z.date(),
});
export type Post = z.infer<typeof post>;

export interface PostRow extends Omit<Post, "media"> {
  media: { position: number; storage_key: string; variants: Record<string, string>; width: number | null; height: number | null; blurhash: string | null }[];
}

/** Columns every post response needs; run inside asUser so RLS decides visibility. */
export const postSelect = (tx: Tx, me: string, base: string | undefined) => tx`
  p.id, p.event_id, (select e.title from public.events e where e.id = p.event_id) as event_title, p.caption, p.place_name, p.status, p.like_count, p.created_at,
  extensions.st_y(p.location::extensions.geometry) as lat,
  extensions.st_x(p.location::extensions.geometry) as lng,
  json_build_object('id', a.id, 'username', a.username, 'display_name', a.display_name,
                    'avatar_url', ${pictureUrl(tx, base, "a.avatar_variants", "150")}) as author,
  exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = ${me}) as liked_by_me,
  coalesce((
    select json_agg(json_build_object(
      'position', m.position, 'storage_key', m.storage_key, 'variants', m.variants,
      'width', m.width, 'height', m.height, 'blurhash', m.blurhash) order by m.position)
    from public.post_media m where m.post_id = p.id
  ), '[]'::json) as media
`;

/**
 * Turns a row into a response. Photos are only served once the worker has
 * checked them; until then the author sees their own pending post without
 * image URLs.
 */
export function postMapper(mediaBaseUrl: string | undefined) {
  const mediaUrl = (key: string) => (mediaBaseUrl ? `${mediaBaseUrl}/${key}` : null);
  return (row: PostRow): Post => ({
    ...row,
    media: row.media.map((m) => ({
      position: m.position,
      url: row.status === "visible" ? mediaUrl(m.storage_key) : null,
      thumbnails:
        row.status === "visible"
          ? Object.fromEntries(
              Object.entries(m.variants).flatMap(([size, key]) => {
                const url = mediaUrl(key);
                return url ? [[size, url]] : [];
              }),
            )
          : {},
      width: m.width,
      height: m.height,
      blurhash: m.blurhash,
    })),
  });
}
