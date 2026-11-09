import type { Db } from "../../db.js";
import { authorAffinity, interestAffinity } from "./affinity.js";

/**
 * For You parties: every party in range is scored on what this person cares
 * about, not only on how close it is. Postgres gathers the features, this file
 * turns them into a score and a reason, so the weights are plain numbers that
 * unit tests pin down. Each signal is scaled to 0..1 (affinities to -1..1).
 */
export const PARTY_WEIGHTS = {
  interest: 3, // the kind of party they like (music, sports...)
  friends: 2.5, // people they follow are going
  host: 2, // a host they follow or keep going back to
  nearby: 1.5, // halves about every 3.5 km
  soon: 1, // on now or starting in the next day or so
  popular: 1, // how many are going, on a log scale
} as const;
/** Parties they already said yes or maybe to: they know about them. */
export const RSVPD_FACTOR = 0.5;
/** Shown this many times in two weeks and never opened: probably not for them. */
export const IGNORED_AFTER = 3;
export const IGNORED_FACTOR = 0.6;

/** Most parties considered per request; the soonest win past this. */
const MAX_CANDIDATES = 500;

export interface PartyFeatures {
  id: string;
  organiser_id: string;
  interest_id: number | null;
  interest_name: string | null;
  distance_m: number;
  /** Negative while the party is already on. */
  starts_in_h: number;
  going: number;
  interested: number;
  friends_going: number;
  /** -1..1, how much they like this kind of party. */
  interest_affinity: number;
  /** -1..1, how much they like this host. */
  host_affinity: number;
  follows_host: boolean;
  my_rsvp: string | null;
  /** Times it was shown to them in the last two weeks. */
  impressions: number;
  /** Opened, shared or saved it. */
  engaged: boolean;
}

export const REASON_KINDS = [
  "friends_going",
  "interest",
  "following_host",
  "liked_host",
  "starting_soon",
  "popular",
  "nearby",
] as const;
export type ReasonKind = (typeof REASON_KINDS)[number];
export interface Reason {
  kind: ReasonKind;
  /** Ready to show under the party, e.g. "Because you like Music". */
  text: string;
}

export interface ScoredParty {
  id: string;
  organiser_id: string;
  interest_id: number | null;
  score: number;
  reason: Reason | null;
  /** Each signal's weighted share of the score, logged so weights can be tuned later. */
  parts: Record<keyof typeof PARTY_WEIGHTS, number>;
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

export function scoreParty(f: PartyFeatures): ScoredParty {
  const signals: Record<keyof typeof PARTY_WEIGHTS, number> = {
    interest: Math.max(-1, Math.min(1, f.interest_affinity)),
    friends: clamp01(Math.log1p(f.friends_going) / Math.log(4)), // three friends is the most it counts
    host: Math.max(-1, Math.min(1, f.host_affinity)),
    nearby: Math.exp(-Math.max(f.distance_m, 0) / 5000),
    soon: f.starts_in_h <= 0 ? 1 : Math.exp(-f.starts_in_h / 36),
    popular: clamp01(Math.log1p(f.going + 0.5 * f.interested) / Math.log(51)),
  };
  const parts = Object.fromEntries(
    Object.entries(signals).map(([k, v]) => [k, PARTY_WEIGHTS[k as keyof typeof PARTY_WEIGHTS] * v]),
  ) as ScoredParty["parts"];
  let score = Object.values(parts).reduce((a, b) => a + b, 0);
  if (f.my_rsvp) score *= RSVPD_FACTOR;
  else if (f.impressions >= IGNORED_AFTER && !f.engaged) score *= IGNORED_FACTOR;
  return { id: f.id, organiser_id: f.organiser_id, interest_id: f.interest_id, score, reason: reason(f, parts), parts };
}

/**
 * The one line that says why this party is here, picked from the signal that
 * added the most, but only when it is strong enough to be true to say.
 */
export function reason(f: PartyFeatures, parts: ScoredParty["parts"]): Reason | null {
  const options: [number, Reason][] = [];
  if (f.friends_going > 0) {
    options.push([parts.friends, {
      kind: "friends_going",
      text: f.friends_going === 1 ? "Someone you follow is going" : `${f.friends_going} people you follow are going`,
    }]);
  }
  if (f.interest_name && f.interest_affinity >= 0.3) {
    options.push([parts.interest, { kind: "interest", text: `Because you like ${f.interest_name}` }]);
  }
  if (f.follows_host) options.push([parts.host, { kind: "following_host", text: "From someone you follow" }]);
  else if (f.host_affinity >= 0.5) options.push([parts.host, { kind: "liked_host", text: "From a host you've liked" }]);
  if (f.starts_in_h <= 3) {
    options.push([parts.soon, { kind: "starting_soon", text: f.starts_in_h <= 0 ? "On right now" : "Starting soon" }]);
  }
  if (f.going >= 10) options.push([parts.popular, { kind: "popular", text: "Popular nearby" }]);
  if (f.distance_m <= 1500) options.push([parts.nearby, { kind: "nearby", text: "Close to you" }]);
  options.sort((a, b) => b[0] - a[0]);
  return options[0]?.[1] ?? null;
}

/**
 * Reorders so no more than `maxRun` in a row share a key (an author, a host,
 * a kind of party), pulling the next-best one with another key forward.
 * Items are only pushed down, never dropped.
 */
export function diversify<T>(ranked: T[], key: (item: T) => unknown, maxRun = 2): T[] {
  const pending = [...ranked];
  const out: T[] = [];
  while (pending.length > 0) {
    const last = out.slice(-maxRun);
    const blocked = last.length === maxRun && last.every((p) => key(p) === key(last[0] as T)) ? key(last[0] as T) : undefined;
    const index = blocked === undefined || blocked === null ? 0 : pending.findIndex((p) => key(p) !== blocked);
    out.push(...pending.splice(index === -1 ? 0 : index, 1));
  }
  return out;
}

export interface PartyQuery {
  lat: number;
  lng: number;
  radiusKm: number;
  from: string;
  to: string;
  interestId?: number | undefined;
}

/**
 * Ranks the public parties around the user. Runs as the database owner because
 * it reads the user's interaction log; the parties are loaded again under RLS
 * before anything is returned.
 */
export async function rankParties(db: Db, me: string, q: PartyQuery): Promise<ScoredParty[]> {
  const here = db`extensions.st_setsrid(extensions.st_makepoint(${q.lng}, ${q.lat}), 4326)::extensions.geography`;
  const rows = await db<PartyFeatures[]>`
    with ia as (${interestAffinity(db, me)}),
         aa as (${authorAffinity(db, me)})
    select e.id, e.organiser_id, e.interest_id, it.name as interest_name,
      extensions.st_distance(e.location, ${here})::float8 as distance_m,
      (extract(epoch from e.starts_at - now()) / 3600)::float8 as starts_in_h,
      (select count(*)::int from public.rsvps r where r.event_id = e.id and r.status = 'going') as going,
      (select count(*)::int from public.rsvps r where r.event_id = e.id and r.status = 'interested') as interested,
      (select count(*)::int from public.rsvps r
       join public.follows fo on fo.followee_id = r.user_id and fo.follower_id = ${me}
       where r.event_id = e.id and r.status = 'going') as friends_going,
      coalesce((select ia.affinity from ia where ia.interest_id = e.interest_id), 0)::float8 as interest_affinity,
      coalesce((select aa.affinity from aa where aa.author_id = e.organiser_id), 0)::float8 as host_affinity,
      exists (select 1 from public.follows fo where fo.follower_id = ${me} and fo.followee_id = e.organiser_id) as follows_host,
      (select r.status from public.rsvps r where r.event_id = e.id and r.user_id = ${me}) as my_rsvp,
      (select count(*)::int from public.interactions i
       where i.user_id = ${me} and i.event_id = e.id and i.kind = 'impression'
         and i.created_at > now() - interval '14 days') as impressions,
      (exists (select 1 from public.interactions i
               where i.user_id = ${me} and i.event_id = e.id and i.kind in ('open', 'share'))
       or exists (select 1 from public.saved_events s where s.user_id = ${me} and s.event_id = e.id)) as engaged
    from public.events e
    left join public.interests it on it.id = e.interest_id
    where e.status = 'published' and not e.is_private
      and extensions.st_dwithin(e.location, ${here}, ${q.radiusKm * 1000})
      and coalesce(e.ends_at, e.starts_at + interval '6 hours') >= ${q.from}::timestamptz
      and e.starts_at < ${q.to}::timestamptz
      ${q.interestId ? db`and e.interest_id = ${q.interestId}` : db``}
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = ${me} and b.blocked_id = e.organiser_id)
                         or (b.blocker_id = e.organiser_id and b.blocked_id = ${me}))
      and not exists (select 1 from public.interactions i
                      where i.user_id = ${me} and i.event_id = e.id and i.kind = 'not_interested')
    order by e.starts_at, e.id
    limit ${MAX_CANDIDATES}
  `;
  const scored = rows
    .map((r) => scoreParty({ ...r, distance_m: Number(r.distance_m), starts_in_h: Number(r.starts_in_h),
                             interest_affinity: Number(r.interest_affinity), host_affinity: Number(r.host_affinity) }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  // Your own parties first, like your own story on Instagram: a host checks theirs
  // is up, and it isn't a recommendation, so it isn't ranked or given a reason.
  const own = scored.filter((p) => p.organiser_id === me).map((p) => ({ ...p, reason: null }));
  const others = scored.filter((p) => p.organiser_id !== me);
  // Not three parties from one host in a row, nor four of one kind.
  return [...own, ...diversify(diversify(others, (p) => p.interest_id, 3), (p) => p.organiser_id, 2)];
}
