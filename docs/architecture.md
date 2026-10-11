# PartyNearMe: target architecture (Instagram/TikTok patterns at startup scale)

Written 2026-10-11. Builds on [analysis.md](analysis.md) (current code) and [launch-costs.md](launch-costs.md) (cost estimate). Research and planning only; nothing in the repo was changed.

## The short version

Copy **how** Instagram and TikTok are built, not **what** they run today. Both started as one simple app on one database and only split into many services once they had hundreds of engineers. The patterns that matter at your size are:

1. **One well-structured backend ("modular monolith") on Postgres**, like Instagram's Django + Postgres start.
2. **Uploads go straight to storage and get processed in the background**, then served from a CDN in several sizes.
3. **A two-stage feed: gather candidates, then rank them**, the same shape as Instagram Explore and TikTok For You, but with a simple scoring function instead of giant neural networks.
4. **Log every view, like and skip as an event.** This is what makes TikTok's feed good; the model matters less than the data.
5. **Realtime chat over one persistent connection plus push notifications**, using a managed service instead of building it.
6. **Native-feeling mobile apps that prefetch the next items**, which is why both apps feel instant.

## What the big apps actually do

| Area | Instagram | TikTok | What it means for PartyNearMe |
|---|---|---|---|
| Backend | Started as a Python/Django monolith on PostgreSQL; still a very large Django app (on Meta's own CPython fork, Cinder), with Postgres sharded, Cassandra for feeds/inboxes and Memcache in front. | Go and Java microservices (ByteDance's open-source Kitex/Hertz frameworks), Kafka, Flink, Redis, MySQL. | Stay on one Node/TypeScript backend with clear modules. Microservices are a cost of having 1,000 engineers, not a cause of scale. |
| Media | Resumable uploads that start while the user is still writing the caption; server makes several sizes/bitrates; adaptive video (DASH) from Meta's CDN. | Same idea, heavy video transcoding to multiple bitrates, aggressive CDN caching. | Phone resizes and uploads directly to storage with a signed URL; a background job makes thumbnails; CDN serves them. Use a managed video service if you add video. |
| Feed ranking | Explore: retrieval of hundreds of candidates from many sources (trending, similar to what you liked, two-tower ML), a cheap first ranker, a heavy multi-task model on the top ~100, then reranking for diversity and safety. Models retrained about hourly. | "Monolith" system: training in near real time from a Kafka/Flink stream of user actions, so the feed adapts within minutes. Interest graph, not friend graph. | Same pipeline shape, tiny scale: candidates from "nearby + upcoming", "organisers you follow", "similar to what you liked", "trending"; rank with a weighted formula; rerank for diversity. Log events from day one so you can swap in ML later. |
| Realtime | Direct runs over MQTT, a lightweight always-on connection, with push notifications when the app is closed. | Similar persistent connection plus push. | Managed realtime (Supabase Realtime) or your Socket.IO server with Redis; FCM/APNs for push. |
| Apps | Native iOS and Android (plus some React Native). | Native, plus their own cross-platform framework (Lynx). | Kotlin Multiplatform + Compose Multiplatform is still the right call: shared logic, native performance, reuses your Android code. |
| Experiments | Everything ships behind feature flags and A/B tests. | Same, at huge scale. | Free tier of PostHog (or similar) for flags, analytics and A/B tests. |

## Recommended target architecture

```
 Android / iOS app (Kotlin Multiplatform + Compose Multiplatform)
   │  REST/JSON (feed, posts, events)      WebSocket (chat, live counts)
   ▼                                        ▼
 ┌─────────────────────────────┐    ┌──────────────────────────┐
 │ API: Node + TypeScript      │    │ Supabase Realtime        │
 │ one app, separate modules:  │    │ (or Socket.IO + Redis)   │
 │ auth · users · posts ·      │    └──────────────────────────┘
 │ events/RSVP · feed · chat · │
 │ moderation · notifications  │──► Redis (cache, counters, rate limits, feed cache)
 └──────────┬──────────────────┘
            │ writes rows + "outbox" events
            ▼
 ┌─────────────────────────────┐    ┌──────────────────────────┐
 │ Postgres (Supabase)         │    │ Background worker        │
 │ + PostGIS (distance)        │◄──►│ (job queue)              │
 │ + pgvector (embeddings)     │    │ thumbnails, embeddings,  │
 │ + events log table          │    │ moderation, push, counts │
 └─────────────────────────────┘    └──────────────────────────┘
            ▲
 Phone ──signed URL──► Cloudflare R2 (photos)  ──► Cloudflare CDN
                       Cloudflare Stream (video, optional)
 Push: FCM (Android) + APNs (iOS)    Flags/analytics: PostHog    Crashes: Sentry
```

### 1. Backend: modular monolith

- Keep Node, move to **TypeScript**, one deployable app with a folder per domain (auth, posts, events, feed, chat…). Each module owns its tables; modules talk through functions, not each other's tables. This is what lets you split a module out later if one ever needs it.
- **Stateless API servers** (no files on local disk, no in-memory sessions) so you can run 2 or 20 copies behind a load balancer. Today's multer-to-disk uploads and the spawned Python child process break this; both move out (sections 2 and 3).
- **Postgres stays the source of truth.** Add **PostGIS** for "parties within 5 km" queries with a spatial index (the current "Nearby" just lists all users), and **pgvector** for interest matching. Both come with Supabase.
- **Cursor pagination everywhere** (`?after=<id>`), never `OFFSET`, as Instagram and TikTok APIs do.
- **Counters (likes, RSVPs, views) live in Redis and are flushed to Postgres** by the worker, so a viral party doesn't lock one row.
- **Outbox pattern:** when something happens (post created, liked, RSVP), write an `events` row in the same transaction. The worker processes them. Later this becomes a Kafka/Redpanda stream with no app rewrite. This is the small-scale version of TikTok's event stream.
- Auth: use Supabase Auth (email, Apple, Google sign-in, which Apple requires if you offer Google) instead of hand-rolled JWT, which also fixes the logout and user `-1` bugs.

### 2. Media pipeline

- **Client resizes and compresses** (e.g. long side 1,080 px, WebP/JPEG ~80%) before upload, like Instagram does.
- **Direct-to-storage upload:** the API hands out a short-lived signed R2 URL; the phone uploads straight to R2, then tells the API "done". API servers never touch image bytes.
- **Start the upload while the user writes the caption** (Instagram's trick); publish is then instant.
- **Background job** makes thumbnail sizes (e.g. 150, 640, 1,080 px) and a **BlurHash** placeholder stored with the post, so the feed shows a coloured blur instantly while images load.
- **Video (optional, for party clips):** use **Cloudflare Stream** (or Mux) for upload, transcoding and adaptive HLS playback instead of building ffmpeg pipelines. Cap clips at ~30–60 s. Video is the biggest cost lever, see below.
- **Moderation on upload:** run images and captions through a moderation API before they appear in other people's feeds (store rules require report/block/remove anyway).

### 3. Feed: candidates → rank → rerank

Same shape as Instagram Explore and TikTok, sized for thousands of users rather than billions.

1. **Candidate generation** (a few hundred items, cheap SQL queries):
   - parties/posts **near the user and happening soon** (PostGIS radius + time window), the core of a party app;
   - posts from **organisers and people you follow**;
   - **similar to what you liked** (pgvector nearest neighbours on post embeddings);
   - **trending nearby** (engagement in the last 24 h, from Redis);
   - a small slice of **fresh/new posts** for exploration, so new organisers get seen (Instagram does this explicitly).
2. **Ranking:** a weighted score per candidate, e.g. distance, how soon the event starts, interest similarity, recent engagement rate, whether you follow the author, freshness. Weights live in config/feature flags so you can A/B test them.
3. **Reranking:** no more than 2 posts in a row from the same organiser, drop blocked users and moderated content, mix event types.
4. **Cache** each user's ranked list in Redis for a few minutes and page through it with a cursor.

**Replace today's recommender:** instead of running the 1.6 GB BART model per feed request, compute an **embedding once per post at upload** (a small text model like MiniLM, or CLIP for image + caption) and store it in pgvector. A user's interest vector is the average of what they liked plus their chosen interests. Runs on a small worker.

**Log everything:** impressions, dwell time, likes, shares, RSVPs, skips, "not interested". These rows are the training data. Once you have tens of thousands of active users, replace the weighted formula with a learned ranker (e.g. gradient-boosted trees, later a two-tower model). Without the logs you can never do that.

**Fan-out:** big apps precompute each user's feed when someone they follow posts ("fan-out on write"). You don't need it: computing on read from Postgres + Redis is fine well past 100k users, and a party feed is mostly location-based anyway.

### 4. Realtime messaging and notifications

- **Don't hand-build chat delivery.** Two good options:
  - **Supabase Realtime** (recommended): clients subscribe to their conversations; messages are Postgres rows with row-level security, so history, unread counts and the inbox come from plain queries. Fits the Supabase stack you'd already pay for.
  - Keep **Socket.IO**, but add the Redis adapter so it works across several servers, and fix the room-join bug. More work, more control.
- **Push notifications** through FCM (Android) and APNs (iOS), sent from the worker for DMs, RSVPs, "your friend is going", event reminders. Free.
- **Realtime extras** that suit a party app: live RSVP counts and "X people here now" on an event page, via the same channel.

### 5. Mobile apps

- **Kotlin Multiplatform + Compose Multiplatform** (unchanged recommendation). Ktor client, kotlinx.serialization, Coil 3, SQLDelight for a local cache.
- **Offline-first cache:** show the last feed instantly from local storage, then refresh (Instagram does this).
- **Prefetch:** load the next page and the next few images/videos before the user scrolls to them (core to TikTok's feel).
- **Optimistic UI:** likes and sent messages appear instantly and roll back on error.
- **Remote config / feature flags** so you can change feed weights or hide a broken feature without a store release.

### 6. Running it

- **Observability:** Sentry for crashes and API errors, structured logs, uptime checks.
- **CI/CD:** GitHub Actions to test and deploy the API; Fastlane or Gradle/Xcode Cloud for store builds.
- **Database migrations in the repo** (fixes the "no schema" problem in analysis.md).
- **Rate limiting** on login, posting and messaging (Redis).

## When to add the "big company" pieces

| Signal | Add |
|---|---|
| Feed queries slow, Postgres CPU high | Read replica; more Redis caching |
| ~50–100k daily active users, enough logged events | Learned ranking model, offline training job |
| Worker queue backs up / several consumers of the same events | Move outbox to Kafka/Redpanda |
| One module needs very different scaling (e.g. chat) | Split just that module into its own service |
| Search becomes a feature | Meilisearch/Typesense |
| Millions of users | Sharding, multi-region, the rest of the Instagram playbook |

## How this changes the cost estimate

Baseline from launch-costs.md: **≈ $40–60/month** small launch, **≈ $160–300/month** growth (~20–50k MAU).

| Change | Small launch | Growth | Notes |
|---|---|---|---|
| Recommender: BART per request → embeddings at upload | −$0 to −$18 | −$0 to −$60 | Small worker ($7–25) instead of $25–85. |
| PostGIS, pgvector, Realtime, Auth | $0 | $0 | Included in Supabase Pro. Realtime quotas on Pro are generous for this size (from general knowledge, not checked today). |
| Redis (Upstash) | $0 | ~$5–20 | Free tier at launch; pay-per-request after. |
| Background worker | included above | +$7–25 | Can share the recommender worker at launch. |
| Push (FCM/APNs) | $0 | $0 | Free. |
| PostHog (flags, analytics, A/B) | $0 | $0–50 | Free tier covers ~1M events/month. |
| Image/caption moderation API | $0 | $0–30 | Free or low-cost tiers exist; depends on volume. |
| **Photo-only subtotal** | **≈ $40–60** | **≈ $170–330** | Roughly unchanged: the savings on the recommender pay for the new pieces. |
| **Optional: video clips via Cloudflare Stream** | +$15–30 | +$150–500 | $5 per 1,000 min stored/month + $1 per 1,000 min watched; encoding free. Example: 5k min stored + 300k min watched = $325/month. |

**Bottom line:** the Instagram/TikTok-style architecture costs about the same as the earlier estimate for a photo app, because the expensive part of today's design (running a big model on every feed request) goes away. **Video is the one decision that changes the bill**: it can double or triple growth-stage costs. A sensible path is to launch photo-first with event pages, and add short clips once you see engagement.

## Suggested build order

1. New Postgres schema with migrations (users, events, RSVPs, posts, media, likes, follows, messages, events log), Supabase Auth.
2. TypeScript API modules + signed-URL uploads to R2 + thumbnail worker.
3. Feed v1: candidates (nearby/upcoming, following, trending) + weighted ranking + event logging.
4. Chat on Supabase Realtime + push notifications.
5. Compose Multiplatform app with caching, prefetch, optimistic UI; iOS target.
6. Moderation, report/block, account deletion (store requirements).
7. Embeddings + "similar to what you liked" candidates; A/B test feed weights.

## Sources

- Instagram Explore pipeline (retrieval, two-tower, multi-stage ranking, hourly retraining): https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/
- Instagram exploration of new content: https://engineering.fb.com/2020/12/10/web/how-instagram-suggests-new-content/
- Scaling Instagram infrastructure (Django, Postgres, Cassandra, Memcache): https://qconsf.com/sf2016/system/files/presentation-slides/scaling_instagram_infrastructure_-_qcon_sf_2016.pdf and https://blog.bytebytego.com/p/how-instagram-scaled-its-infrastructure
- Messaging at scale at Instagram (PyCon 2013): https://pyvideo.org/pycon-us-2013/messaging-at-scale-at-instagram.html
- TikTok/ByteDance Monolith real-time recommender: https://www.nextplatform.com/2022/09/26/chinas-bytedance-intros-different-approach-to-recommendation-at-scale/ and https://thenewstack.io/what-makes-tiktoks-algorithms-so-effective/
- Cloudflare Stream pricing (checked 2026-10-11): https://developers.cloudflare.com/stream/pricing
- Upstash Redis pricing: https://upstash.com/pricing/redis
- From general knowledge, not checked today: Instagram's MQTT-based Direct, Cinder, TikTok's Go/Java stack (Kitex/Hertz) and Lynx, Supabase Realtime quotas, PostHog free tier, moderation API pricing.
