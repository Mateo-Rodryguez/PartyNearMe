-- Event visibility and RSVP rules.
--
-- RSVPs only on events that are published, so nobody can RSVP to someone
-- else's draft or a cancelled event by guessing its id.

create function public.is_open_event(event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events
    where id = event and status = 'published'
  );
$$;

revoke execute on function public.is_open_event(uuid) from public, anon;
grant execute on function public.is_open_event(uuid) to authenticated, service_role;

drop policy rsvps_insert on public.rsvps;
create policy rsvps_insert on public.rsvps for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_open_event(event_id));

drop policy rsvps_update on public.rsvps;
create policy rsvps_update on public.rsvps for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_open_event(event_id));

-- Only the RSVP status can change.
revoke update on public.rsvps from authenticated;
grant update (status) on public.rsvps to authenticated;

-- Cancelled events stay visible, so people who planned to go find out.
drop policy events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (status in ('published', 'cancelled') or organiser_id = (select auth.uid()));
