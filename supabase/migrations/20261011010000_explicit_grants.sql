-- Explicit table permissions.
--
-- The Supabase project is created with "automatically expose new tables" off,
-- so nothing is reachable through the Data API unless granted here. To make the
-- result the same whatever that setting is, start from nothing and grant only
-- what each role needs. RLS policies then decide which rows.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- The API's admin tasks and the background worker.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Signed-in users. Signed-out (anon) gets nothing.
grant select on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_key) on public.profiles to authenticated;

grant select on public.interests to authenticated;
grant select, insert, delete on public.user_interests to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.blocks to authenticated;

grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.rsvps to authenticated;

grant select, insert, delete on public.posts to authenticated;
grant update (caption) on public.posts to authenticated;
grant select on public.post_media to authenticated;
grant select, insert, delete on public.likes to authenticated;

grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

grant insert on public.reports to authenticated;

-- outbox and interactions: service_role only.

grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
