-- Learning what people like, dislike and struggle with (docs/analytics.md).
--
-- feedback: what people tell us themselves, from Settings > Send feedback, the
-- occasional "would you recommend PartyNearMe to a friend?" card (0-10, the Net
-- Promoter Score) and the "how did you hear about us?" step in onboarding.
-- Private: people can add their own rows but nobody can read them through the
-- API; only the owner (Supabase dashboard / SQL editor) reads them.
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  -- Unlinked (null) when the account is deleted, so "why I left" outlives it.
  user_id     uuid references public.profiles (id) on delete set null,
  -- love: something they like; problem: something not working or confusing;
  -- idea: something they wish it did; nps: the recommend score;
  -- heard_from: how they found the app (body is one of the app's choices);
  -- leaving: why they deleted their account, asked as they do.
  kind        text not null check (kind in ('love', 'problem', 'idea', 'nps', 'heard_from', 'leaving')),
  score       smallint check (score between 0 and 10),
  body        text check (char_length(body) between 1 and 2000),
  -- The screen it was sent from, when that helps explain it.
  screen      text check (char_length(screen) <= 40),
  platform    text not null check (platform in ('android', 'ios')),
  app_version text check (char_length(app_version) <= 20),
  created_at  timestamptz not null default now(),
  check ((kind = 'nps') = (score is not null)),
  check (kind = 'nps' or body is not null)
);
-- For the per-user limit (backend/src/limits.ts) and reading one person's history.
create index feedback_user_idx on public.feedback (user_id, created_at desc);
create index feedback_kind_idx on public.feedback (kind, created_at desc);

alter table public.feedback enable row level security;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
grant insert (user_id, kind, score, body, screen, platform, app_version) on public.feedback to authenticated;
grant all on public.feedback to service_role;

-- How often share links (/e/<party>, /p/<post>) are opened by people, per day:
-- the clearest sign of word of mouth. Link-preview bots (WhatsApp, iMessage...)
-- are not counted. Only counts, never who opened them. Written by the API as
-- the owner; no access through the Data API.
create table public.share_link_views (
  kind      text not null check (kind in ('party', 'post')),
  target_id uuid not null,
  day       date not null default current_date,
  views     integer not null default 1,
  primary key (kind, target_id, day)
);
alter table public.share_link_views enable row level security;
grant all on public.share_link_views to service_role;
