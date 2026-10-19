-- Settings, relationship status, saved posts and parties, and people search.

-- Relationship status, shown as a small heart next to the name on profiles.
-- Null (the default) shows nothing. Public like the rest of the profile.
alter table public.profiles add column relationship_status text
  check (relationship_status in ('taken', 'talking', 'single'));
grant update (relationship_status) on public.profiles to authenticated;

-- Private settings, one row per user, created on first change. Only the user
-- can read theirs; the worker and start_direct_conversation read them as owner.
create table public.user_settings (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  -- Who can start a new chat: 'everyone', or only people the user follows.
  messages_from  text not null default 'everyone' check (messages_from in ('everyone', 'following')),
  push_messages  boolean not null default true,
  push_rsvps     boolean not null default true,
  push_reminders boolean not null default true,
  updated_at     timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_insert on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_settings to authenticated;
grant all on public.user_settings to service_role;

-- Saved posts and parties: private bookmarks, newest first.
create table public.saved_posts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index saved_posts_user_idx on public.saved_posts (user_id, created_at desc);

create table public.saved_events (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index saved_events_user_idx on public.saved_events (user_id, created_at desc);

alter table public.saved_posts enable row level security;
alter table public.saved_events enable row level security;
create policy saved_posts_select on public.saved_posts for select to authenticated
  using (user_id = (select auth.uid()));
create policy saved_posts_insert on public.saved_posts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy saved_posts_delete on public.saved_posts for delete to authenticated
  using (user_id = (select auth.uid()));
create policy saved_events_select on public.saved_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy saved_events_insert on public.saved_events for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy saved_events_delete on public.saved_events for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, delete on public.saved_posts, public.saved_events to authenticated;
grant all on public.saved_posts, public.saved_events to service_role;

-- People search matches the start of usernames ("sa" finds @sam) with this index.
create index profiles_username_pattern_idx on public.profiles (username text_pattern_ops);

-- The followers and following lists, newest first.
create index follows_followee_created_idx on public.follows (followee_id, created_at desc);
create index follows_follower_created_idx on public.follows (follower_id, created_at desc);

-- Starting a chat now also respects "Who can message you". Chats that already
-- exist carry on; only new ones are refused.
create or replace function public.start_direct_conversation(other_user uuid) returns uuid
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

  select id into conversation from public.conversations where direct_key = key;
  if conversation is not null then
    return conversation;
  end if;

  if exists (
    select 1 from public.user_settings s
    where s.user_id = other_user and s.messages_from = 'following'
      and not exists (select 1 from public.follows f where f.follower_id = other_user and f.followee_id = me)
  ) then
    raise exception 'They only get messages from people they follow' using errcode = 'PN403';
  end if;

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
