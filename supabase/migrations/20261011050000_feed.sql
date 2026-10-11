-- Feed v1: each feed refresh ranks up to 200 posts once and stores the order,
-- so paging is stable while scores drift (stands in for a Redis cache).

create table public.feed_snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_ids   uuid[] not null,
  created_at timestamptz not null default now()
);
create index feed_snapshots_user_idx on public.feed_snapshots (user_id, created_at);

-- Only the API (as the owner) reads and writes snapshots.
alter table public.feed_snapshots enable row level security;
grant all on public.feed_snapshots to service_role;

-- The ranker looks up each user's recent interactions.
create index interactions_user_idx on public.interactions (user_id, created_at desc) where user_id is not null;
