# Learning what people love and struggle with

PartyNearMe is meant to grow by word of mouth, so the product has to be good
enough that people tell their friends. This document says how the app learns
what people like, dislike, struggle with and never use, and is the **contract
every version follows**: Android (Compose, `app/`), the native iPhone app
(SwiftUI, `ios/`) and the website (SvelteKit, `web/`, `src/lib/analytics.ts`)
send the same events with the same names and properties, so one PostHog
dashboard covers all three. On the web a "screen" is a page, "backgrounded" is
the tab being hidden or closed, and there are no cookies: the session id lives
in memory and the share-usage choice in local storage.

## Three sources, three questions

| Source | Answers | Where it lives |
| --- | --- | --- |
| **Usage events** | What do people do, skip, and get stuck on? | PostHog (EU cloud), sent from the phone |
| **Feedback** | What do people *say* they love, hate, wish for? Would they recommend us? How did they find us? Why did they leave? | `public.feedback` in Supabase |
| **Share link opens** | How far does word of mouth travel? | `public.share_link_views` in Supabase |

Crashes and server errors stay in Sentry. The feed's own impression log
(`/interactions`) stays separate: it trains the feed, it is not analytics.

## Privacy rules (both apps)

- Signed in, events carry the **account id** and nothing else that identifies
  anyone. Signed out (the sign-in screen), they carry a random id made fresh at
  each launch and never stored.
- **Never** send names, usernames, emails, locations, captions, comments,
  messages, search text, or any other id (post, party, person). Properties are
  counts, kinds and fixed choices only.
- No person profiles (`$process_person_profile: false`), no session replay,
  no advertising ids, no third-party SDK: the apps post to PostHog's
  `/batch/` endpoint themselves.
- People can turn usage events off under **Settings > Share usage stats**
  (shown once a PostHog key is set). Feedback is always sent, because the
  person chose to send it.
- PostHog project setting **Discard client IP data** must be on.

## Properties on every event

| Property | Example | Notes |
| --- | --- | --- |
| `platform` | `android` / `ios` / `web` | |
| `$app_version` | `1.4.0` (web: the short commit, e.g. `6365aeb`) | so a release that made things worse shows up |
| `$session_id` | UUID v7 | new after 30 minutes without events |
| `$screen_name` | `party` | the screen on show when it happened |
| `signed_in` | `true` | |

## Screen names

Sent as PostHog's `$screen` event with `$screen_name`, plus `from` (the
previous screen) and `from_seconds` (how long it was open). Never rename one:
add a new name instead, or the history splits.

`sign_in`, `profile_setup`, `onboarding_interests`, `onboarding_heard_from`,
`onboarding_location`, `home`, `nearby`, `new_post`, `inbox`, `my_profile`,
`party`, `new_party`, `edit_party`, `profile`, `chat`, `post`, `comments`,
`notifications`, `moderation`, `settings`, `search`, `followers`, `following`,
`saved`, `blocked`, `invite`, `guest_list`, `feedback`.

## Events

### Coming and going

| Event | Properties | When |
| --- | --- | --- |
| `app_opened` | `first_run` or `resumed` | signed-in app start; or back after 30+ minutes away |
| `app_backgrounded` | `seconds` | app leaves the screen; `$screen_name` is where people left |
| `link_opened` | `kind` (`party`/`post`/`other`) | a shared link opened the app |
| `notification_opened` | `type` | a push notification was tapped |
| `push_permission` | `granted` | the answer to the system "allow notifications?" question, asked once (iPhone only for now) |
| `signed_out` | | |
| `account_deleted` | | the strongest "didn't like it" there is |

### Getting started (the activation funnel)

| Event | Properties | When |
| --- | --- | --- |
| `auth_succeeded` | `method` (`email`/`google`), `action` (`sign_in`/`sign_up`/`reset_password`), `check_email` | |
| `auth_failed` | `method`, `action`, `reason` (the error shown, never what was typed) | |
| `auth_cancelled` | `method` | closed the Google page |
| `account_created` | | picked a username |
| `heard_about_us` | `source` (see feedback below) | onboarding |
| `onboarding_completed` | `interests` (count), `location` (allowed) | |

### Doing things

Captured by the screen, because they carry useful detail:

| Event | Properties |
| --- | --- |
| `post_created` | `photos`, `tagged`, `at_party` |
| `party_created` | `has_cover`, `has_kind` |
| `rsvp_changed` | `status` (`going`/`interested`/`requested`/`none`) |
| `comment_posted` | |
| `invites_sent` | `sent`, `skipped` |
| `link_shared` | `kind` (`party`/`post`) |

Captured automatically from a successful API call (`Analytics.ACTIONS` on
Android, `Analytics.actions` on iPhone), so every screen that does them is
covered:

| Call | Event |
| --- | --- |
| `PUT` / `DELETE /posts/:id/like` | `post_liked` / `post_unliked` |
| `PUT` / `DELETE /posts/:id/save` | `post_saved` / `post_unsaved` |
| `PATCH /posts/:id` | `caption_edited` |
| `DELETE /posts/:id` | `post_deleted` |
| `PUT /posts/:id/tags` | `people_tagged` |
| `DELETE /posts/:id/tags/me` | `tag_removed` |
| `DELETE /comments/:id` | `comment_deleted` |
| `PUT` / `DELETE /events/:id/save` | `party_saved` / `party_unsaved` |
| `PATCH /events/:id` | `party_edited` |
| `DELETE /events/:id` | `party_deleted` |
| `PUT /events/:id/cover` | `party_cover_set` |
| `POST /events/:id/guests/:id/approve` | `guest_approved` |
| `DELETE /events/:id/guests/:id` | `guest_removed` |
| `PUT` / `DELETE /users/:id/follow` | `user_followed` / `user_unfollowed` |
| `PUT` / `DELETE /users/:id/block` | `user_blocked` / `user_unblocked` |
| `POST /reports` | `report_sent` |
| `POST /conversations` | `chat_started` |
| `POST /conversations/:id/messages` | `message_sent` |
| `PATCH /me` | `profile_edited` |
| `PUT /me/avatar` | `avatar_set` |
| `PUT /me/interests` | `interests_set` |
| `PATCH /me/settings` | `account_setting_changed` |
| `DELETE /me` | `account_deleted` |

### Struggles

| Event | Properties | Means |
| --- | --- | --- |
| `api_error` | `endpoint` (e.g. `POST /posts/:id/comments`), `status` (0 = no connection) | something failed on someone; ids are replaced by `:id`. A failed photo upload is `PUT /photo-upload`. |
| `nearby_empty` | `radius_km`, `time`, `kind_filter` | no parties near someone: the biggest letdown a party app has |
| `for_you_sort` | `sort` (`for_you`, `soonest`) | someone switched how parties are sorted: do they trust For you? (docs/recommendations.md) |
| `nearby_no_location` | | Nearby without location access |
| `search_no_results` | `length` | a people search (3+ letters) found nobody |
| `auth_failed` | see above | |

### Feedback and settings

| Event | Properties |
| --- | --- |
| `feedback_sent` | `kind`, `score`, `has_text` |
| `recommend_shown` / `recommend_dismissed` | |
| `usage_stats_turned_off` / `usage_stats_turned_on` | sent just before turning off, so we know how many do |

## Feedback (what people tell us)

`POST /feedback` with `kind`, `platform` (`android`, `ios` or `web`), optional `body`, `score`, `screen`,
`app_version`. Kinds:

- `love`, `problem`, `idea`: **Settings > Send feedback**.
- `nps`: "How likely are you to recommend PartyNearMe to a friend?" (0-10),
  a card at the top of Home. Shown once someone has used the app on 3+ days
  over at least a week, then at most every 90 days. A score can come with a
  reason ("What do you love most?" for 9-10, "What would make it a 10?"
  otherwise).
- `heard_from`: onboarding step, `body` is one of `friend`, `shared_link`,
  `social_media`, `app_store`, `venue_or_event`, `other`.
- `leaving`: optional reason in the delete-account dialog.

Rows are private (no read access through the API) and are kept, unlinked from
the account, when an account is deleted.

### Reading it (Supabase SQL editor)

```sql
-- Net Promoter Score for the last 90 days: % promoters (9-10) minus % detractors (0-6).
select count(*) as answers,
       round(100.0 * (count(*) filter (where score >= 9) - count(*) filter (where score <= 6)) / nullif(count(*), 0)) as nps
from public.feedback where kind = 'nps' and created_at > now() - interval '90 days';

-- How people found the app.
select body as source, count(*) from public.feedback where kind = 'heard_from' group by 1 order by 2 desc;

-- Everything people wrote this week, newest first.
select created_at, kind, score, screen, platform, app_version, body
from public.feedback where body is not null and kind <> 'heard_from' and created_at > now() - interval '7 days'
order by created_at desc;

-- Share links opened by people (not preview bots), per day.
select day, kind, sum(views) as opens from public.share_link_views group by 1, 2 order by 1 desc, 2;
```

## PostHog: what to build first

After the setup in [deploy.md](deploy.md#usage-statistics-posthog), create
these insights in one dashboard called "Is it good?":

1. **Activation funnel**: `$screen` sign_in → `auth_succeeded` →
   `account_created` → `onboarding_completed` → `rsvp_changed` or
   `post_created` (within 7 days). Where the biggest drop is, fix first.
2. **Retention**: "came back" = any event, first time = `account_created`,
   weekly. The best single measure of whether people love it.
3. **Stickiness / DAU, WAU, MAU** of `app_opened`.
4. **Feature use**: trends of the action events above, broken down by event,
   last 30 days. What's near zero is unused: improve it, explain it, or cut it.
5. **Screens**: `$screen` broken down by `$screen_name`; plus average
   `from_seconds` by `from` to see where people linger or bounce.
6. **Where people leave**: `app_backgrounded` broken down by `$screen_name`.
7. **Struggles**: `api_error` broken down by `endpoint` and `status`;
   `nearby_empty` by `radius_km`; `auth_failed` by `reason`.
8. **Word of mouth**: `link_shared` vs `link_opened`, `invites_sent`,
   `heard_about_us` by `source`.
9. **Releases**: any of the above broken down by `$app_version`.

## Adding an event

1. Pick a name: `object_verb` in the past tense (`party_saved`), snake_case.
2. Add it to the tables above, with its properties, in the same PR.
3. Properties: counts, booleans, and fixed choices only (see Privacy rules).
4. Do both apps, or note in the PR which one follows.
