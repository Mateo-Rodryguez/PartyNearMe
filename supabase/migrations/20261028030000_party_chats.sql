-- A group chat for each party: the host and everyone going.
--
-- The chat is made the first time someone says they're going, with the host
-- in it; people join when they RSVP "going" and leave when they stop. The host
-- always stays. Blocks work differently from one-to-one chats: a block can't
-- silence a whole party, so instead the blocker doesn't see (or get pushed)
-- the blocked person's messages there.

alter table public.conversations
  add column event_id uuid unique references public.events (id) on delete cascade;

-- Returns the party's chat, creating it with the host on first use.
create function public.ensure_party_chat(party uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  chat uuid;
  host uuid;
begin
  select id into chat from public.conversations where event_id = party;
  if chat is not null then
    return chat;
  end if;
  select organiser_id into host from public.events where id = party;
  if host is null then
    return null;
  end if;
  insert into public.conversations (event_id) values (party)
  on conflict (event_id) do nothing
  returning id into chat;
  if chat is null then
    select id into chat from public.conversations where event_id = party;
  else
    insert into public.conversation_members (conversation_id, user_id) values (chat, host)
    on conflict do nothing;
  end if;
  return chat;
end;
$$;
revoke execute on function public.ensure_party_chat(uuid) from public, anon, authenticated;

-- Keeps the chat's members in step with who is going.
create function public.sync_party_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  chat uuid;
  host uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'going' then
    chat := public.ensure_party_chat(new.event_id);
    if chat is not null then
      insert into public.conversation_members (conversation_id, user_id) values (chat, new.user_id)
      on conflict do nothing;
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'going' and (tg_op = 'DELETE' or new.status <> 'going') then
    select c.id, e.organiser_id into chat, host
    from public.conversations c join public.events e on e.id = c.event_id
    where c.event_id = old.event_id;
    if chat is not null and old.user_id <> host then
      delete from public.conversation_members where conversation_id = chat and user_id = old.user_id;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.sync_party_chat() from public, anon, authenticated;

create trigger rsvps_party_chat
  after insert or update of status or delete on public.rsvps
  for each row execute function public.sync_party_chat();

-- Parties that already have guests get their chat now.
do $$
declare
  r record;
  chat uuid;
begin
  for r in select distinct event_id from public.rsvps where status = 'going' loop
    chat := public.ensure_party_chat(r.event_id);
    insert into public.conversation_members (conversation_id, user_id)
    select chat, user_id from public.rsvps where event_id = r.event_id and status = 'going'
    on conflict do nothing;
  end loop;
end;
$$;

-- Blocks stop new messages only in one-to-one chats (see the top of this file).
create or replace function public.on_message_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A block placed after the chat started still stops new messages.
  if exists (
    select 1
    from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id
    join public.blocks b
      on (b.blocker_id = m.user_id and b.blocked_id = new.sender_id)
      or (b.blocker_id = new.sender_id and b.blocked_id = m.user_id)
    where c.id = new.conversation_id and c.event_id is null and m.user_id <> new.sender_id
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
