import type { Db } from "../../db.js";
import { authorAffinity, interestAffinity } from "../recommend/affinity.js";
import { diversify as diversifyBy } from "../recommend/parties.js";

/**
 * Feed v1 weights. Each signal is scaled to 0..1 before weighting. Tune here;
 * they move to feature flags once there is traffic to test against.
 */
export const WEIGHTS = {
  following: 3, // the author is someone I follow
  nearby: 2, // decays with distance, half at ~3.5 km
  fresh: 1.5, // decays with age, half at ~17 hours
  popular: 1, // likes, on a log scale up to 100
  eventSoon: 1, // attached to an event happening in the next 48 hours
  myEvent: 1, // attached to an event I RSVP'd to
  author: 2, // how much I like this person's posts and parties (-1..1), see recommend/affinity.ts
  interest: 1.5, // from a kind of party I like (-1..1)
} as const;
/** Posts I've already been shown keep this share of their score. */
export const SEEN_FACTOR = 0.3;

const CANDIDATE_DAYS = 7;
const MAX_CANDIDATES = 1000;
export const SNAPSHOT_SIZE = 200;
/** No more than this many posts in a row from the same author. */
export const MAX_RUN = 2;

export interface Ranked {
  id: string;
  author_id: string;
  score: number;
}

/**
 * Scores recent visible posts for a user. Runs as the database owner because
 * it reads the user's interaction log, which users can't read themselves; the
 * posts are loaded again under RLS before anything is returned.
 */
export async function rankPosts(db: Db, me: string, here: { lat: number; lng: number } | null): Promise<Ranked[]> {
  const point = here
    ? db`extensions.st_setsrid(extensions.st_makepoint(${here.lng}, ${here.lat}), 4326)::extensions.geography`
    : db`null::extensions.geography`;
  return db<Ranked[]>`
    with ia as (${interestAffinity(db, me)}),
         aa as (${authorAffinity(db, me)}),
    candidates as (
      select p.id, p.author_id, p.like_count, p.created_at,
             coalesce((select ia.affinity from ia where ia.interest_id = e.interest_id), 0) as interest_affinity,
             coalesce((select aa.affinity from aa where aa.author_id = p.author_id), 0) as author_affinity,
             coalesce(p.location, e.location) as location,
             e.starts_at as event_starts_at,
             exists (select 1 from public.follows f
                     where f.follower_id = ${me} and f.followee_id = p.author_id) as following,
             exists (select 1 from public.rsvps r
                     where r.user_id = ${me} and r.event_id = p.event_id) as my_event,
             exists (select 1 from public.interactions i
                     where i.user_id = ${me} and i.post_id = p.id and i.kind = 'impression') as seen
      from public.posts p
      left join public.events e on e.id = p.event_id and e.status = 'published'
      where p.status = 'visible'
        and p.created_at > now() - ${`${CANDIDATE_DAYS} days`}::interval
        and p.author_id <> ${me}
        and not exists (select 1 from public.blocks b
                        where (b.blocker_id = ${me} and b.blocked_id = p.author_id)
                           or (b.blocker_id = p.author_id and b.blocked_id = ${me}))
        and not exists (select 1 from public.interactions i
                        where i.user_id = ${me} and i.post_id = p.id and i.kind = 'not_interested')
      order by p.created_at desc
      limit ${MAX_CANDIDATES}
    )
    select id, author_id,
      (
        ${WEIGHTS.following}::float8 * following::int
        + ${WEIGHTS.nearby}::float8 * coalesce(exp(-extensions.st_distance(location, ${point}) / 5000.0), 0)
        + ${WEIGHTS.fresh}::float8 * exp(-extract(epoch from now() - created_at) / 86400.0)
        + ${WEIGHTS.popular}::float8 * least(ln(1 + like_count) / ln(101), 1)
        + ${WEIGHTS.eventSoon}::float8 * coalesce(event_starts_at between now() - interval '6 hours' and now() + interval '48 hours', false)::int
        + ${WEIGHTS.myEvent}::float8 * my_event::int
        + ${WEIGHTS.author}::float8 * author_affinity
        + ${WEIGHTS.interest}::float8 * interest_affinity
      ) * case when seen then ${SEEN_FACTOR}::float8 else 1 end as score
    from candidates
    order by score desc, id
    limit ${SNAPSHOT_SIZE}
  `.then((rows) => rows.map((r) => ({ ...r, score: Number(r.score) })));
}

/** No more than maxRun posts in a row from one author; see recommend/parties.ts. */
export const diversify = <T extends { author_id: string }>(ranked: T[], maxRun = MAX_RUN): T[] =>
  diversifyBy(ranked, (p) => p.author_id, maxRun);
