# PartyNearMe relaunch plan

Written 2026-10-11. Ordered milestones from an empty fresh repo to launch on Google Play and the App Store.
Builds on [architecture.md](architecture.md) (target design), [analysis.md](analysis.md) (old code) and [launch-costs.md](launch-costs.md) (costs).

**Decisions in force:** photo-only launch (video later), fresh repo reusing old code where it fits, Kotlin Multiplatform + Compose Multiplatform for both apps, no Mac yet so iOS is built on cloud macOS CI until there is one.

## The shape of it

| # | Milestone | Done when |
|---|---|---|
| 0 | Fresh repo and foundations | Repo, CI, Supabase project and migrations exist; nothing secret in git |
| 1 | Secure backend core | Every security issue from the old code is fixed by design and tested |
| 2 | Photo pipeline and moderation | Photos go phone → R2 → thumbnails → CDN, checked before others see them |
| 3 | Events, RSVPs and nearby | The "party" part of the pitch exists: events, organisers, RSVP, real distance search |
| 4 | Feed v1 and event logging | Ranked "For You" from nearby/following/trending, every view and like logged |
| 5 | Chat and push | DMs deliver live, with history, inbox and push notifications |
| 6 | Android app on KMP | Android app runs against the real backend, with shared KMP code |
| 7 | iOS app via cloud CI | iOS build produced by CI and installable through TestFlight |
| 8 | Store requirements | Report, block, account deletion, privacy policy, store forms |
| 9 | Betas | Play closed test (12 testers × 14 days) passed; TestFlight beta run |
| 10 | Launch | Both apps public, monitoring on |
| 11 | After launch | Embeddings / "similar parties", AI assist, video clips |

Milestones 0 to 5 are backend and can be built and tested without any phone. The app (6, 7) can start once milestone 1's API contract is stable, in parallel with 2 to 5.

## Milestone 0: fresh repo and foundations

- **One monorepo:** `backend/` (Node + TypeScript API and worker), `app/` (KMP: `shared/`, `androidApp/`, `iosApp/`), `supabase/` (SQL migrations), `docs/`.
- **Git hygiene from commit one:** `.gitignore` for `node_modules`, build outputs, `.env`, keys and certs; `.env.example` listing every variable; secrets only in GitHub Actions secrets and the host's env settings.
- **Supabase project** (free tier while building, Pro at beta) with PostGIS and pgvector turned on. Schema lives in versioned migrations; the first migration recreates the old tables properly (users/profiles, posts, post_media, likes, interests, user_interests, messages) so nothing has to be reverse-engineered again.
- **CI on GitHub Actions:** lint, typecheck and tests for `backend/` on every push; Android build on every push; iOS build job added in milestone 7.
- **Hosting accounts:** Render (API + worker), Cloudflare (R2 + domain), Sentry, PostHog. All on free tiers until beta.

## Milestone 1: secure backend core (security fixes first)

The old API's security problems are fixed by how the new one is built, not patched one by one.

| Old problem (analysis.md) | New design |
|---|---|
| JWT issued but never checked; endpoints trust the `userId` the client sends | Supabase Auth; one middleware verifies the token on every route; the user id **only** comes from the verified token, never from the body or query |
| `GET /users` returns `password_hash` | Passwords live in Supabase Auth, never in our tables; responses go through explicit output schemas so no column leaks by accident |
| Hand-rolled login, broken logout, new user lands as `-1` | Supabase Auth sessions on the client; sign in with Apple and Google plus email |
| Self-signed cert with private key committed, pinned in the app | Real TLS from the host (Render/Cloudflare); no certs in the repo; no custom pinning |
| Uploads accept any type and size | No uploads through the API at all (milestone 2); signed URLs limited by type and size |
| Database open to whatever the API does | Row-level security on every table as a second line of defence |
| No input validation, empty-interests 500 | Request schemas (zod) on every endpoint; validation errors return 400 |
| No rate limits | Rate limits on sign-in, posting, messaging (Redis/Upstash) |
| Shared Python process mixing up concurrent results | Removed; ML moves to the worker (milestone 4/11) |

Also in this milestone: modular folder layout (auth, users, posts, events, feed, chat, moderation, notifications), cursor pagination, the outbox `events` table written in the same transaction as each action, structured logging, Sentry, an OpenAPI description of the endpoints, and tests covering "user A cannot read or change user B's data".

**Reused from old code:** query logic and table shapes from `db2/index.js`, the 10 interest categories.

## Milestone 2: photo pipeline and moderation

- API hands out short-lived signed R2 upload URLs (image types only, size cap); phone uploads directly; API is told "done".
- Worker makes 150/640/1080 px sizes and a BlurHash; CDN serves them.
- Image and caption moderation before a post is visible to others; flagged posts go to a review queue.
- Like endpoint with Redis counters flushed to Postgres (the old app's heart button did nothing).

## Milestone 3: events, RSVPs and nearby

This is the product gap the old app never filled.

- Events with title, start/end time, place (PostGIS point), cover photo, organiser.
- RSVP (going / interested), live counts, follow organisers and users.
- "Near me" search: events within a radius and time window, using a spatial index.
- Posts can be attached to an event.

## Milestone 4: feed v1 and event logging

- Candidates: nearby and happening soon, people/organisers you follow, trending nearby, a slice of fresh posts.
- Weighted ranking with weights in config/PostHog flags; diversity rerank (no more than two in a row from one author, drop blocked and moderated).
- Ranked list cached per user in Redis, paged by cursor.
- Log impressions, dwell, likes, RSVPs, skips from day one. This replaces the BART recommender; embeddings come in milestone 11.

## Milestone 5: chat and push

- DMs on Supabase Realtime: conversations and messages as rows with row-level security, so history, inbox and unread counts are plain queries. Fixes every chat bug in analysis.md (circular join, wrong ids, missing inbox endpoint, colliding conversation ids).
- Push through FCM (Android) and APNs (iOS) from the worker: new message, RSVP on your event, event reminders.

## Milestone 6: Android app on Kotlin Multiplatform

- New KMP project: shared Ktor client, kotlinx.serialization, SQLDelight cache, Supabase Kotlin client; Compose Multiplatform UI.
- **Ported from the old Android app:** screens and layout (feed, profile grid, new post, interests dialog, bottom navigation), camera/gallery and location flows (Android-specific pieces stay in `androidMain`).
- **Replaced:** Retrofit/Gson, hard-coded `10.0.2.2` URLs, SharedPrefs user id, pinned cert, Socket.IO client.
- Offline-first feed cache, prefetch of the next page and images, optimistic likes and messages.
- Fixes from analysis.md: camera permission requested, null captions handled.

## Milestone 7: iOS via cloud macOS CI (no Mac yet)

Kotlin/Native iOS targets only compile on macOS, so every iOS build runs in the cloud.

- **Build:** GitHub Actions macOS runner (or Codemagic, which has a free monthly allowance of macOS minutes) builds the iOS app on each push to `main`.
- **Signing and upload:** Apple Developer account ($99/yr) created at this point; certificates and profiles managed by Fastlane match, stored as CI secrets; each build uploaded to TestFlight automatically.
- **Testing without a Mac:** install builds on an iPhone through TestFlight. Without an iPhone, a friend's phone works for testing too, or the beta testers do it.
- **iOS-specific pieces** (camera, photo picker, location, push, Sign in with Apple) are written in `iosMain` and are the riskiest part to build blind: CI compiles them, but debugging is slow without Xcode.
- **When a Mac arrives**, it replaces the slow loop for UI and iOS debugging. CI keeps doing release builds.

Note: GitHub's macOS minutes are free for public repos but billed at a higher rate than Linux on private ones, so if the new repo is private, iOS jobs should run only on `main` and release branches (from general knowledge, not checked today).

## Milestone 8: store requirements

- Report post/user, block user, moderator tools to remove content (Apple 1.2, Google UGC policy).
- In-app account deletion that deletes data, not just the login.
- Privacy policy and terms pages on the domain; Apple privacy label and Google Data safety form (location, photos, messages).
- Permission explanation strings for camera, photos, location, notifications.
- Age rating (party content likely needs 17+/Mature).

## Milestone 9: betas

- **Start the Play closed test as early as an Android build is usable**, because new personal developer accounts need 12 testers opted in for 14 consecutive days before going public. Line up the 12 testers early.
- TestFlight external beta for iOS (needs a light Apple review).
- Upgrade to paid tiers here: Supabase Pro, Render always-on (≈ $40–60/month total, see launch-costs.md).
- Seed real events in one city so the first users see a populated feed.

## Milestone 10: launch

- Production release on both stores; store listings, screenshots.
- Sentry alerts, uptime checks, daily backups confirmed, a rollback plan for the API.

## Milestone 11: after launch

- Embeddings computed at upload into pgvector: "similar parties" candidates and better interest matching.
- AI assist: caption writing for organisers, "what's on tonight near me?".
- Short video clips via Cloudflare Stream once engagement justifies the cost.
- Learned ranker once enough events are logged.

## What has to happen outside the code

| When | Who | What |
|---|---|---|
| Before milestone 0 | Mateo | Create the new GitHub repo and give Claude access to it |
| Milestone 0 | Mateo | Sign up for Supabase, Render, Cloudflare (Claude can't create accounts or enter payment details) |
| Milestone 6 | Mateo | Google Play developer account ($25) |
| Milestone 7 | Mateo | Apple Developer account ($99/yr) |
| Milestone 9 | Mateo | Recruit 12 Play testers and some iOS testers |
| Any time | Mateo | Buy a Mac if possible before heavy iOS work |
