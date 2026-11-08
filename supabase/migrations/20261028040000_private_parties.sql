-- Private parties with a guest list, and ticket links.
--
-- A private party stays off Nearby. Anyone with the link or an invite can see
-- its title and time, but the venue and exact spot only show to the host and
-- approved guests. Saying "going" to someone else's private party becomes a
-- request ('requested') that the host approves or declines.

alter table public.events
  add column is_private boolean not null default false,
  -- Where to buy tickets (Eventbrite, Dice, the venue's site...). https only.
  add column ticket_url text check (ticket_url is null or (ticket_url ~ '^https://[^\s]+$' and char_length(ticket_url) <= 500));
grant update (is_private, ticket_url) on public.events to authenticated;

alter table public.rsvps drop constraint rsvps_status_check;
alter table public.rsvps add constraint rsvps_status_check check (status in ('going', 'interested', 'requested'));

-- A guest's own "going" on a private party turns into a request. The host's
-- approval runs as the owner (no auth.uid()), so it goes through as "going".
create function public.rsvp_needs_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'going' and (tg_op = 'INSERT' or old.status <> 'going')
     and new.user_id = (select auth.uid())
     and exists (select 1 from public.events e where e.id = new.event_id and e.is_private and e.organiser_id <> new.user_id)
  then
    new.status := 'requested';
  end if;
  return new;
end;
$$;
revoke execute on function public.rsvp_needs_approval() from public, anon, authenticated;

create trigger rsvps_needs_approval
  before insert or update of status on public.rsvps
  for each row execute function public.rsvp_needs_approval();

-- Hosts hear about requests; guests hear when they're approved, and an
-- approval isn't announced to the host as a new guest.
create or replace function public.outbox_rsvp_going() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'going' and tg_op = 'UPDATE' and old.status = 'requested' then
    insert into public.outbox (topic, payload)
    values ('rsvp.approved', jsonb_build_object('event_id', new.event_id, 'user_id', new.user_id));
  elsif new.status = 'going' and (tg_op = 'INSERT' or old.status <> 'going') then
    insert into public.outbox (topic, payload)
    values ('rsvp.going', jsonb_build_object('event_id', new.event_id, 'user_id', new.user_id));
  elsif new.status = 'requested' and (tg_op = 'INSERT' or old.status <> 'requested') then
    insert into public.outbox (topic, payload)
    values ('rsvp.requested', jsonb_build_object('event_id', new.event_id, 'user_id', new.user_id));
  end if;
  return null;
end;
$$;
