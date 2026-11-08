-- PartyNearMe initial schema.
--
-- Row-level security is on for every table. The API normally talks to the
-- database with the service role (which bypasses RLS); the policies here are
-- the second line of defence and what protects tables the app reads directly
-- (chat over Supabase Realtime).

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

-- Credentials live in Supabase Auth (auth.users); this table never holds them.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique check (username ~ '^[a-z0-9_.]{3,30}$'),
  display_name text check (char_length(display_name) <= 60),
  bio          text check (char_length(bio) <= 300),
  avatar_key   text,
  created_at   timestamptz not null default now()
);

-- Every new auth user gets a profile row; username is chosen during onboarding.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.interests (
  id   smallint primary key,
  slug text not null unique,
  name text not null
);

insert into public.interests (id, slug, name) values
  (1, 'music', 'Music'),
  (2, 'sports', 'Sports'),
  (3, 'fitness', 'Fitness'),
  (4, 'food', 'Food'),
  (5, 'travel', 'Travel'),
  (6, 'tech', 'Tech'),
  (7, 'fashion', 'Fashion'),
  (8, 'art', 'Art'),
  (9, 'gaming', 'Gaming'),
  (10, 'other', 'Other');

create table public.user_interests (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  interest_id smallint not null references public.interests (id),
  primary key (user_id, interest_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------------
-- Events and RSVPs
-- ---------------------------------------------------------------------------

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  organiser_id uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  description  text check (char_length(description) <= 2000),
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  venue_name   text check (char_length(venue_name) <= 120),
  location     extensions.geography (point, 4326) not null,
  cover_key    text,
  status       text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'removed')),
  created_at   timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index events_location_idx on public.events using gist (location);
create index events_starts_at_idx on public.events (starts_at) where status = 'published';
create index events_organiser_idx on public.events (organiser_id);

create table public.rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index rsvps_user_idx on public.rsvps (user_id);

-- ---------------------------------------------------------------------------
-- Posts and media
-- ---------------------------------------------------------------------------

create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid references public.events (id) on delete set null,
  caption    text check (char_length(caption) <= 2200),
  location   extensions.geography (point, 4326),
  place_name text check (char_length(place_name) <= 120),
  -- New posts stay 'pending' until moderation marks them 'visible'.
  status     text not null default 'pending' check (status in ('pending', 'visible', 'hidden', 'removed')),
  like_count integer not null default 0 check (like_count >= 0),
  -- Filled by the worker at upload time; powers "similar parties" (milestone 11).
  embedding  extensions.vector (384),
  created_at timestamptz not null default now()
);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_event_idx on public.posts (event_id) where event_id is not null;
create index posts_feed_idx on public.posts (created_at desc) where status = 'visible';
create index posts_location_idx on public.posts using gist (location);

create table public.post_media (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  position   smallint not null check (position between 0 and 9),
  -- Object key of the original in R2; resized variants are listed in "variants".
  storage_key text not null,
  width      integer check (width > 0),
  height     integer check (height > 0),
  blurhash   text,
  variants   jsonb not null default '{}'::jsonb,
  unique (post_id, position)
);

create table public.likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index likes_user_idx on public.likes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  -- For one-to-one chats: "<smaller uuid>:<larger uuid>", so a pair only ever
  -- has one conversation (the old app could hand two chats the same id).
  direct_key      text unique,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, id desc);

-- Used by policies; security definer so the membership check doesn't recurse
-- through conversation_members' own policy.
create function public.is_conversation_member(conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conversation and user_id = (select auth.uid())
  );
$$;

-- Returns the one-to-one conversation between the caller and another user,
-- creating it on first use.
create function public.start_direct_conversation(other_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  key text;
  conversation uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if other_user = me then
    raise exception 'cannot start a conversation with yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = me and blocked_id = other_user)
       or (blocker_id = other_user and blocked_id = me)
  ) then
    raise exception 'conversation not allowed' using errcode = '42501';
  end if;

  key := least(me, other_user)::text || ':' || greatest(me, other_user)::text;

  insert into public.conversations (direct_key) values (key)
  on conflict (direct_key) do nothing
  returning id into conversation;

  if conversation is null then
    select id into conversation from public.conversations where direct_key = key;
  else
    insert into public.conversation_members (conversation_id, user_id)
    values (conversation, me), (conversation, other_user);
  end if;

  return conversation;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'event', 'user', 'message')),
  target_id   text not null,
  reason      text not null check (char_length(reason) between 1 and 500),
  status      text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at  timestamptz not null default now()
);
create index reports_open_idx on public.reports (created_at) where status = 'open';

-- ---------------------------------------------------------------------------
-- Background work and analytics (service role only: RLS on, no policies)
-- ---------------------------------------------------------------------------

-- Outbox: written in the same transaction as the change it describes; the
-- worker processes rows in order and marks them done.
create table public.outbox (
  id           bigint generated always as identity primary key,
  topic        text not null,
  payload      jsonb not null,
  attempts     integer not null default 0,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index outbox_pending_idx on public.outbox (id) where processed_at is null;

-- Every impression, like, RSVP and skip, the training data for feed ranking.
create table public.interactions (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  kind       text not null check (kind in ('impression', 'dwell', 'like', 'unlike', 'rsvp', 'share', 'skip', 'not_interested', 'open')),
  post_id    uuid,
  event_id   uuid,
  dwell_ms   integer check (dwell_ms >= 0),
  created_at timestamptz not null default now()
);
create index interactions_created_idx on public.interactions using brin (created_at);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.interests            enable row level security;
alter table public.user_interests       enable row level security;
alter table public.follows              enable row level security;
alter table public.blocks               enable row level security;
alter table public.events               enable row level security;
alter table public.rsvps                enable row level security;
alter table public.posts                enable row level security;
alter table public.post_media           enable row level security;
alter table public.likes                enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.reports              enable row level security;
alter table public.outbox               enable row level security;
alter table public.interactions         enable row level security;

-- Profiles: any signed-in user can read; you can only edit your own.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy interests_select on public.interests for select to authenticated using (true);

create policy user_interests_select on public.user_interests for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_interests_insert on public.user_interests for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_interests_delete on public.user_interests for delete to authenticated
  using (user_id = (select auth.uid()));

create policy follows_select on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_insert on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Events: published ones are public to signed-in users; drafts only to the organiser.
create policy events_select on public.events for select to authenticated
  using (status = 'published' or organiser_id = (select auth.uid()));
create policy events_insert on public.events for insert to authenticated
  with check (organiser_id = (select auth.uid()) and status in ('draft', 'published'));
create policy events_update on public.events for update to authenticated
  using (organiser_id = (select auth.uid()))
  with check (organiser_id = (select auth.uid()) and status in ('draft', 'published', 'cancelled'));
create policy events_delete on public.events for delete to authenticated
  using (organiser_id = (select auth.uid()));

create policy rsvps_select on public.rsvps for select to authenticated using (true);
create policy rsvps_insert on public.rsvps for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy rsvps_update on public.rsvps for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy rsvps_delete on public.rsvps for delete to authenticated
  using (user_id = (select auth.uid()));

-- Posts: others see only moderated ('visible') posts; authors see their own.
-- New posts must start as 'pending', and only the caption is editable.
create policy posts_select on public.posts for select to authenticated
  using (status = 'visible' or author_id = (select auth.uid()));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'pending' and like_count = 0);
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = (select auth.uid()));
revoke update on public.posts from authenticated;
grant update (caption) on public.posts to authenticated;

create policy post_media_select on public.post_media for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id and (p.status = 'visible' or p.author_id = (select auth.uid()))
  ));

create policy likes_select on public.likes for select to authenticated using (true);
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy likes_delete on public.likes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Messaging: members only. Conversations are created through
-- start_direct_conversation(), never inserted directly.
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
create policy conversation_members_select on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy conversation_members_update on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.conversation_members from authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));

-- Reports: anyone can file one; only moderators (service role) read them.
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

revoke execute on function public.start_direct_conversation(uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
