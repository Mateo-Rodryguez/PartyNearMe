-- Moderators work through reports inside the app instead of the SQL editor.
--
-- Who is a moderator is decided only here, by the database owner (see
-- docs/moderation.md); the API checks this table as the owner, so users can't
-- read or change it. Every decision is kept in moderation_actions.

create table public.moderators (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.moderation_actions (
  id           bigint generated always as identity primary key,
  -- Kept when the moderator's account goes, so the history stays complete.
  moderator_id uuid references public.profiles (id) on delete set null,
  target_type  text not null check (target_type in ('post', 'event', 'user', 'message')),
  target_id    text not null,
  action       text not null check (action in ('remove', 'restore', 'dismiss', 'remove_picture', 'delete_account')),
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id);

alter table public.moderators enable row level security;
alter table public.moderation_actions enable row level security;
-- No policies: only the service role reads or writes these.
grant all on public.moderators, public.moderation_actions to service_role;
