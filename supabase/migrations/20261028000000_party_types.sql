-- What kind of party it is, picked from the same list as people's interests
-- (music, sports, food...), so Nearby can be filtered by it. Optional.

alter table public.events add column interest_id smallint references public.interests (id);
grant update (interest_id) on public.events to authenticated;
create index events_interest_idx on public.events (interest_id) where status = 'published';
