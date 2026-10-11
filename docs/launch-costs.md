# PartyNearMe: what it costs to launch on Android and iOS

Prices checked on 2026-10-11 from the providers' own pricing pages (links at the bottom). All figures in USD.

## Short answer

- **Fees to be in the stores:** $25 once (Google Play) + $99 per year (Apple).
- **Running it for a small launch (up to a few thousand users):** about **$40–60 per month**.
- **Running it at a growth stage (roughly 20–50k monthly users):** about **$160–300 per month**.
- **Maintenance per year, all-in:** about **$600–850** small, **$2,000–3,700** at growth, if you do the upkeep yourself.
- **The big variable is iOS.** If you build it yourself with Kotlin Multiplatform, the cost is your time plus a Mac (about $600 if you don't have one). Paying someone for a native iOS rewrite is the expensive path, likely $10k–40k (my rough estimate from typical freelance rates, not a quote).

Before any of this matters, the code needs work: the security issues in the analysis (JWT never checked, `GET /users` returns password hashes), chat that doesn't deliver messages, and the "events" part of the pitch that doesn't exist yet. That work is time, not money, if you do it yourself.

## One-time and yearly costs

| Item | Cost | Notes |
|---|---|---|
| Google Play developer account | $25 once | New personal accounts must run a closed test with **12 testers opted in for 14 days in a row** before going public. |
| Apple Developer Program | $99 / year | Required to publish on the App Store and use TestFlight. |
| A Mac | ~$600 (Mac mini) or $0 if you have one | Xcode only runs on macOS; needed to build, debug and submit the iOS app. Cloud Mac build services exist but are painful for day-to-day iOS work. |
| Domain name | ~$10–15 / year | For the API (`api.partynearme.…`) and the privacy-policy page both stores require. |
| Privacy policy and terms | $0–150 | Free generators are fine to start. |

## Recommended setup (new production database included)

Replace the old dev database with a managed Postgres, and move images out of the API server's disk into object storage.

| Piece | Small launch | Growth | Pick |
|---|---|---|---|
| **Database** (Postgres) | $25 | $40–75 | **Supabase Pro**: includes a Micro database (1 GB RAM), 8 GB disk, 100 GB file storage, 250 GB egress. Growth = upgrading compute to Small ($15) or Medium ($60), minus the $10 credit. Its built-in Auth and Realtime could also replace the hand-rolled login and the broken Socket.IO chat. |
| **API + chat server** (Node) | $7 | $50–75 | **Render**: one always-on 512 MB instance at launch; two 1 CPU / 2 GB instances ($25 each) at growth, plus possibly the $25 Pro workspace. Railway is a similar alternative ($5 or $20 minimum, then usage). |
| **Recommender** (Python) | $7–25 | $25–85 | Today's `bart-large-mnli` model is ~1.6 GB and needs 2–4 GB of RAM. Cheapest fix: classify each post's interests **once, when it's uploaded**, and store the result, instead of running the model on every feed request. With a smaller model that fits in 512 MB–1 GB it's $7; keeping BART needs a 2 GB ($25) or 4 GB ($85) worker. |
| **Images** | $0 | ~$5–15 | **Cloudflare R2**: $0.015/GB-month, first 10 GB free, and **no egress fees**, which matters for a photo feed. Supabase Storage also works at launch (100 GB included) but charges $0.09/GB for egress past 250 GB, so a busy feed gets expensive there. Resize photos on upload to cut size further. |
| Email, crash reporting | $0 | $0–50 | Free tiers (e.g. Resend for email, Sentry for crashes) cover a launch. |
| **Monthly total** | **≈ $40–60** | **≈ $160–300** | |

**Not recommended for production:** free tiers of Supabase (pauses after a week idle) and Render (spins down when idle). They're fine for the 14-day Play closed test or a TestFlight beta.

**Alternative database:** Neon (serverless Postgres) is pay-as-you-go: $0.106 per compute-hour and $0.35/GB-month on the Launch plan. A small always-on database lands around $20–30/month; it's cheaper if traffic is spiky because it scales to zero. Pair it with R2 for images.

## Ongoing maintenance (per year)

| | Small launch | Growth |
|---|---|---|
| Hosting (monthly totals above × 12) | $480–720 | $1,920–3,600 |
| Apple membership + domain | ~$110 | ~$110 |
| **Cash cost per year** | **≈ $600–850** | **≈ $2,000–3,700** |

Recurring work that costs time, not money, if you do it yourself:

- **Yearly store deadlines:** Google Play requires apps to target a recent Android API level (roughly within a year of the newest), and Apple requires builds made with a recent Xcode/iOS SDK each spring. Miss them and you can't ship updates (and on Play, new users on newer phones can't install).
- **Dependency and security updates** for the Node API, Python recommender and both apps, a few hours a month.
- **Moderation:** reviewing reported posts and users. Small at launch, grows with users.
- **Backups and monitoring:** Supabase Pro includes daily backups (kept 7 days); crash reporting and uptime alerts on free tiers.

If you'd rather pay someone to maintain it, a part-time freelancer retainer is very roughly $500–2,000 a month (my estimate from typical rates, not a quote), which would dwarf the hosting bill.

## The iOS question

| Option | What it means | Cost | Verdict |
|---|---|---|---|
| **Kotlin Multiplatform + Compose Multiplatform** | Keep the Kotlin/Compose Android app and share most of it with iOS. Compose for iOS has been stable since 2025. Swap Retrofit/Gson for Ktor/kotlinx.serialization; camera and location need small iOS-specific pieces. Coil already supports it. | Your time + a Mac | **Recommended.** Reuses the code you already wrote, one codebase. |
| Native Swift/SwiftUI rewrite | A second app built from scratch for iOS. | Your time ×2 to maintain, or ~$10k–40k to hire out (rough estimate) | Best iOS feel, but you maintain two apps forever. |
| Rewrite both in Flutter or React Native | Throw away the Android app and rebuild once for both. | Your time; Expo's build service is free for 15+15 builds/month, $19/month after | Only worth it if you'd rather work in Dart or JS/TS. |

## Store requirements that affect the build (no extra cost, but must exist)

- **User-generated content rules (Apple guideline 1.2, Google UGC policy):** a way to report posts, block users, and remove objectionable content.
- **In-app account deletion:** required by both stores for apps with sign-up.
- **Privacy policy URL and data forms:** Apple's privacy "nutrition label" and Google's Data safety form (you collect location and photos).
- **Location and camera permission explanations** in both apps.

## Sources

- Apple Developer Program fee: https://developer.apple.com/support/enrollment/
- Google Play registration fee: https://support.google.com/googleplay/android-developer/answer/6112435
- Google Play testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- Supabase pricing: https://supabase.com/pricing
- Neon pricing: https://neon.com/pricing
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Render pricing: https://render.com/pricing
- Railway pricing: https://railway.com/pricing
- Expo (EAS) pricing: https://expo.dev/pricing
- Mac price, iOS freelance rates and Compose Multiplatform status are from general knowledge, not checked today.
