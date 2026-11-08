-- Chat and push notifications.
--
-- Messages are rows under RLS: the app sends through the API and receives
-- live through Supabase Realtime. A trigger keeps each conversation's
-- last_message_at current, refuses messages between users who blocked each
-- other, and queues a push for the worker.

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

create function public.on_message_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A block placed after the chat started still stops new messages.
  if exists (
    select 1
    from public.conversation_members m
    join public.blocks b
      on (b.blocker_id = m.user_id and b.blocked_id = new.sender_id)
      or (b.blocker_id = new.sender_id and b.blocked_id = m.user_id)
    where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id
  ) then
    raise exception 'conversation not allowed' using errcode = '42501';
  end if;

  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  -- Your own message counts as read.
  update public.conversation_members set last_read_at = new.created_at
  where conversation_id = new.conversation_id and user_id = new.sender_id;

  insert into public.outbox (topic, payload)
  values ('message.created', jsonb_build_object('message_id', new.id));
  return new;
end;
$$;
revoke execute on function public.on_message_created() from public, anon, authenticated;

create trigger messages_created
  after insert on public.messages
  for each row execute function public.on_message_created();

create index conversations_last_message_idx on public.conversations (last_message_at desc nulls last);

-- Live delivery to the app. The publication only exists on real Supabase.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Devices for push
-- ---------------------------------------------------------------------------

create table public.device_tokens (
  token      text primary key check (char_length(token) between 10 and 4096),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;
-- The API registers tokens as the owner (a token moves to whoever signed in
-- last on that phone); users can see and remove their own.
create policy device_tokens_select on public.device_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy device_tokens_delete on public.device_tokens for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.device_tokens from anon, authenticated;
grant select, delete on public.device_tokens to authenticated;
grant all on public.device_tokens to service_role;

-- ---------------------------------------------------------------------------
-- RSVP and reminder notifications
-- ---------------------------------------------------------------------------

create function public.outbox_rsvp_going() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'going' and (tg_op = 'INSERT' or old.status <> 'going') then
    insert into public.outbox (topic, payload)
    values ('rsvp.going', jsonb_build_object('event_id', new.event_id, 'user_id', new.user_id));
  end if;
  return null;
end;
$$;
revoke execute on function public.outbox_rsvp_going() from public, anon, authenticated;

create trigger rsvps_outbox
  after insert or update of status on public.rsvps
  for each row execute function public.outbox_rsvp_going();

-- Set by the worker when it queues the "starting soon" reminder.
alter table public.events add column reminder_queued_at timestamptz;
create index events_reminder_idx on public.events (starts_at)
  where status = 'published' and reminder_queued_at is null;
