import type { Db } from "../../db.js";

/**
 * What a user cares about, learned from what they did rather than only what
 * they said. Two tables of raw scores, both computed in Postgres on the fly
 * (cheap at this scale; they move to a nightly materialised table once a
 * request starts to feel them):
 *
 * - interest affinity: one score per party kind (music, sports...), from the
 *   interests picked at sign-up plus RSVPs, saves, likes, opens, shares and
 *   "not interested" on parties of that kind and posts from them.
 * - author affinity: one score per person, from following them, liking or
 *   commenting on their posts, going to their parties, and the same negative
 *   signals.
 *
 * Every behavioural signal fades with a 30-day half-life, so tastes can change.
 * The weights are guesses to start from; docs/recommendations.md says how to
 * tune them against the analytics.
 */

/** Days for a behavioural signal to count half as much. */
export const HALF_LIFE_DAYS = 30;
/** Signals older than this are ignored altogether. */
const LOOKBACK_DAYS = 180;
/** The interaction log is noisier and bigger; only its recent part counts. */
const INTERACTION_DAYS = 90;

export const INTEREST_SIGNALS = {
  picked: 2, // chosen at sign-up or in settings; never fades
  going: 3,
  interested: 2,
  requested: 2,
  saved: 2,
  liked: 1, // liked a post from a party of that kind
  shared: 2,
  opened: 0.5,
  dwell: 0.5, // at most, for 10 s or more on a post
  skipped: -0.3,
  notInterested: -3,
} as const;

export const AUTHOR_SIGNALS = {
  follow: 3,
  going: 3,
  interested: 2,
  requested: 2,
  saved: 1.5,
  liked: 1,
  commented: 1.5,
  shared: 2,
  opened: 0.5,
  dwell: 0.5,
  skipped: -0.3,
  notInterested: -3,
} as const;

/** exp() argument that halves a weight every HALF_LIFE_DAYS since `column`. */
const decay = (db: Db, column: "r.created_at" | "s.created_at" | "l.created_at" | "c.created_at" | "i.created_at") =>
  db.unsafe(`exp(-extract(epoch from now() - ${column}) / ${(HALF_LIFE_DAYS * 86400) / Math.LN2})`);

/** What one logged interaction is worth, given a table of weights. */
const interactionWeight = (db: Db, w: typeof INTEREST_SIGNALS | typeof AUTHOR_SIGNALS) => db`
  case i.kind
    when 'share' then ${w.shared}::float8
    when 'open' then ${w.opened}::float8
    when 'dwell' then ${w.dwell}::float8 * least(coalesce(i.dwell_ms, 0) / 10000.0, 1)
    when 'skip' then ${w.skipped}::float8
    when 'not_interested' then ${w.notInterested}::float8
    else 0
  end * ${decay(db, "i.created_at")}
`;

const rsvpWeight = (db: Db, w: typeof INTEREST_SIGNALS | typeof AUTHOR_SIGNALS) => db`
  case r.status when 'going' then ${w.going}::float8 when 'interested' then ${w.interested}::float8
                else ${w.requested}::float8 end * ${decay(db, "r.created_at")}
`;

/**
 * Rows of (interest_id, affinity) for `me`, with affinity scaled to -1..1 by
 * the user's strongest interest, so 1 is "the thing they like most". Use as a
 * CTE body.
 */
export function interestAffinity(db: Db, me: string) {
  const since = `${LOOKBACK_DAYS} days`;
  const recent = `${INTERACTION_DAYS} days`;
  return db`
    select interest_id, score / nullif(max(abs(score)) over (), 0) as affinity
    from (
      select interest_id, sum(w) as score
      from (
        select ui.interest_id, ${INTEREST_SIGNALS.picked}::float8 as w
        from public.user_interests ui where ui.user_id = ${me}
        union all
        select e.interest_id, ${rsvpWeight(db, INTEREST_SIGNALS)}
        from public.rsvps r join public.events e on e.id = r.event_id
        where r.user_id = ${me} and r.created_at > now() - ${since}::interval
        union all
        select e.interest_id, ${INTEREST_SIGNALS.saved}::float8 * ${decay(db, "s.created_at")}
        from public.saved_events s join public.events e on e.id = s.event_id
        where s.user_id = ${me} and s.created_at > now() - ${since}::interval
        union all
        select e.interest_id, ${INTEREST_SIGNALS.liked}::float8 * ${decay(db, "l.created_at")}
        from public.likes l join public.posts p on p.id = l.post_id join public.events e on e.id = p.event_id
        where l.user_id = ${me} and l.created_at > now() - ${since}::interval
        union all
        select e.interest_id, ${interactionWeight(db, INTEREST_SIGNALS)}
        from public.interactions i
        left join public.posts p on p.id = i.post_id
        join public.events e on e.id = coalesce(i.event_id, p.event_id)
        where i.user_id = ${me} and i.created_at > now() - ${recent}::interval
          and i.kind in ('share', 'open', 'dwell', 'skip', 'not_interested')
      ) signals
      where interest_id is not null
      group by interest_id
    ) totals
  `;
}

/**
 * Rows of (author_id, affinity) for `me`: how much they like what this person
 * posts or hosts, saturating at 1 (and at -1 for people they keep skipping).
 * Use as a CTE body.
 */
export function authorAffinity(db: Db, me: string) {
  const since = `${LOOKBACK_DAYS} days`;
  const recent = `${INTERACTION_DAYS} days`;
  return db`
    select author_id,
           case when score >= 0 then 1 - exp(-score / 2) else -(1 - exp(score / 2)) end as affinity
    from (
      select author_id, sum(w) as score
      from (
        select f.followee_id as author_id, ${AUTHOR_SIGNALS.follow}::float8 as w
        from public.follows f where f.follower_id = ${me}
        union all
        select e.organiser_id, ${rsvpWeight(db, AUTHOR_SIGNALS)}
        from public.rsvps r join public.events e on e.id = r.event_id
        where r.user_id = ${me} and r.created_at > now() - ${since}::interval
        union all
        select e.organiser_id, ${AUTHOR_SIGNALS.saved}::float8 * ${decay(db, "s.created_at")}
        from public.saved_events s join public.events e on e.id = s.event_id
        where s.user_id = ${me} and s.created_at > now() - ${since}::interval
        union all
        select p.author_id, ${AUTHOR_SIGNALS.liked}::float8 * ${decay(db, "l.created_at")}
        from public.likes l join public.posts p on p.id = l.post_id
        where l.user_id = ${me} and l.created_at > now() - ${since}::interval
        union all
        select p.author_id, ${AUTHOR_SIGNALS.commented}::float8 * ${decay(db, "c.created_at")}
        from public.comments c join public.posts p on p.id = c.post_id
        where c.author_id = ${me} and c.created_at > now() - ${since}::interval
        union all
        select coalesce(p.author_id, e.organiser_id), ${interactionWeight(db, AUTHOR_SIGNALS)}
        from public.interactions i
        left join public.posts p on p.id = i.post_id
        left join public.events e on e.id = i.event_id
        where i.user_id = ${me} and i.created_at > now() - ${recent}::interval
          and i.kind in ('share', 'open', 'dwell', 'skip', 'not_interested')
      ) signals
      where author_id is not null and author_id <> ${me}
      group by author_id
    ) totals
  `;
}
