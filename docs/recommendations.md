# For You: recommending what people actually care about

A party one kilometre away is no use if it's not someone's thing. For You
ranks parties (and the home feed's posts) by what each person has shown they
care about, then by distance and timing. This document is the design, the
**contract all three clients follow** (Android `app/`, iPhone `ios/`, web
`web/`), and how to tune it from evidence.

## How it works (v1: scoring in Postgres, free)

At today's scale a hand-tuned score over a few strong signals beats a learned
model, and it costs nothing: everything runs in the existing Postgres. Every
request logs what it served and why, so a learned ranker can replace the
weights later without changing the apps.

### 1. What the person cares about (`backend/src/modules/recommend/affinity.ts`)

Two affinity tables, computed per request:

| Affinity | Built from | Scale |
| --- | --- | --- |
| **Kind of party** (music, sports, food...) | interests picked at sign-up (+2, never fades); going (+3), interested or requested (+2), saved (+2), liked a post from such a party (+1), shared (+2), opened (+0.5), dwell on a post (up to +0.5), skipped (-0.3), "not interested" (-3) | divided by their strongest kind: -1..1 |
| **Person** (host or poster) | following (+3), going to their parties (+3), interested (+2), saved one (+1.5), liked (+1) or commented on (+1.5) their posts, shared (+2), opened (+0.5), dwell, skipped, "not interested" | saturating, `1 - e^(-s/2)`: -1..1 |

Behaviour fades with a **30-day half-life** (180 days max; the interaction log
counts for 90 days), so tastes can change.

### 2. Parties For You (`GET /events/for-you`, `recommend/parties.ts`)

Every public party in range (default 25 km, next 14 days, max 500 soonest) is
scored. Each signal is 0..1 (affinities -1..1), times its weight:

| Signal | Weight | Meaning |
| --- | --- | --- |
| interest | 3 | the kind of party they like |
| friends | 2.5 | people they follow are going; three friends is the most it counts |
| host | 2 | a host they follow or keep coming back to |
| nearby | 1.5 | `e^(-d/5 km)` |
| soon | 1 | on now = 1, then `e^(-hours/36)` |
| popular | 1 | going + half of interested, log scale, 50 is the most it counts |

Then: parties they already RSVP'd to keep **half** their score (they know
about them); parties shown 3+ times in two weeks and never opened, shared or
saved keep **60%**. Their own, private, blocked-either-way and "not
interested" parties are left out. Finally the list is reordered so no more than
3 in a row are of one kind and 2 in a row from one host.

Each party comes back with a **reason**, the strongest signal that is true to
say: "2 people you follow are going", "Because you like Music", "From someone
you follow", "From a host you've liked", "On right now" / "Starting soon",
"Popular nearby", "Close to you". The server writes the text, so it can be
tuned without an app release. Showing *why* builds trust, and it tells us
which reasons work (below).

### 3. Home feed (`GET /feed`, `feed/ranking.ts`)

The existing post ranking gains two terms: **author affinity** (weight 2) and
the **kind of party** the post is from (weight 1.5). Following, nearby,
freshness, likes, upcoming and my-party boosts are unchanged.

## Measuring it (the new analytics)

The interaction log was impressions, dwell and opens. Now it also says
**where** each happened and **in which ranked list**, so we can see whether
For You actually leads to more opens and RSVPs than the plain date-ordered
list.

- `recommendation_serves`: each For You response, every item with its score,
  reason and each signal's share. Kept 30 days. This is the training data for
  a learned ranker later.
- `interactions.surface`: `for_you_parties`, `nearby`, `feed`, `profile`,
  `saved`, `search`, `other`.
- `interactions.serve_id` and `position`: which list and where in it.

`GET /moderation/recommendation-stats?days=14` (moderators only, counts only)
answers:

| Question | Field |
| --- | --- |
| Does For You beat the date list? Compare `opens/impressions` and `rsvps/impressions` for `for_you_parties` vs `nearby`. | `by_day` |
| Which reasons convince people? A reason with many impressions and few RSVPs is weighted too high. | `by_reason` |
| Is the top of the list the best? Opens should fall with position; if 4-10 converts like 1-3, ranking adds little. | `by_position` |

An impression counts once per person, item, list and day. An open, RSVP or
like within 24 hours of it counts as its outcome. The web app shows the stats
on the moderation page.

PostHog keeps the product side: `for_you_sort` (people switching between For
you and Soonest), so we see whether people trust the ranking.

### Tuning loop

1. Wait for a few hundred For You impressions.
2. Look at `by_reason` and `by_position`. Raise the weight of signals whose
   reasons convert best; lower those that don't.
3. Change the numbers in `PARTY_WEIGHTS` / `WEIGHTS` and the unit tests that
   pin them, ship, compare the next two weeks.
4. Once there are thousands of serves with outcomes, fit a logistic regression
   on the logged `parts` (free, offline, in a notebook) and use its
   coefficients as the weights. Beyond that: embeddings (pgvector, already
   installed) for "parties like the ones you went to".

## Client contract

All three clients do the same:

1. **Parties tab** opens on **For you** (sort toggle: For you / Soonest).
   For you calls `GET /events/for-you?lat&lng&radius_km&from&to&interest_id`
   with the same time and kind filters as the date list, shows the list in the
   server's order (not grouped by day) and the `reason.text` under each card.
   Soonest is the existing `GET /events/nearby` list. The choice is
   remembered on the device. Track `for_you_sort` with `sort: for_you|soonest`
   when the person switches.
2. **Impressions**: when a party card is first on screen in either list, log
   `{kind: "impression", event_id, surface, position}` plus `serve_id` for For
   you. Once per card per load.
3. **Opens**: opening a party logs `{kind: "open", event_id, surface}` (and
   `serve_id`, `position` when it came from For you). Opening it from anywhere
   else logs `surface: "other"`.
4. **Feed**: impressions, dwell and opens carry `surface: "feed"` and the
   `serve_id` from `GET /feed`, plus `position`.
5. Everything goes through the existing batched `POST /interactions`.
