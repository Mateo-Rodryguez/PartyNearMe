-- For You: a log of what was recommended and why, so recommendations can be
-- measured (did people open and RSVP to what we showed?) and the weights tuned
-- from evidence. See docs/recommendations.md.

-- One row per ranked list served: the items in order, each with its score, the
-- reason shown and every signal's share of the score.
create table public.recommendation_serves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  surface    text not null check (surface in ('for_you_parties', 'feed')),
  items      jsonb not null,
  created_at timestamptz not null default now()
);
create index recommendation_serves_user_idx on public.recommendation_serves (user_id, created_at desc);
create index recommendation_serves_created_idx on public.recommendation_serves using brin (created_at);

-- Only the API (as the owner) reads and writes it.
alter table public.recommendation_serves enable row level security;
grant all on public.recommendation_serves to service_role;

-- Where in the app each impression, open or share happened, which list it came
-- from and at what position, so For You can be compared with the plain lists.
alter table public.interactions
  add column surface  text check (surface in ('for_you_parties', 'nearby', 'feed', 'profile', 'saved', 'search', 'other')),
  add column serve_id uuid,
  add column position smallint check (position between 0 and 999);

-- Stats look up impressions by event and by serve.
create index interactions_event_idx on public.interactions (event_id, created_at) where event_id is not null;
create index interactions_serve_idx on public.interactions (serve_id) where serve_id is not null;
