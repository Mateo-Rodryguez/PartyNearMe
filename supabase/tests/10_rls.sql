-- Row-level security tests: every check runs as a signed-in user, the way the
-- app and Supabase Realtime reach the database. Rolled back at the end.

begin;

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Fails unless running the statement raises an error.
create function tests.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'expected an error but none was raised: %', label;
end;
$$;

create function tests.expect_eq(actual bigint, expected bigint, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception '%: expected %, got %', label, expected, actual;
  end if;
end;
$$;

create function tests.sign_in(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(user_id::text, ''), true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com');

select tests.expect_eq((select count(*) from public.profiles), 3, 'a profile is created for each new user');

-- Seed data the users will act on (as the database owner, bypassing RLS).
insert into public.events (id, organiser_id, title, starts_at, location, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Rooftop party',
   now() + interval '1 day', extensions.st_point(-0.1276, 51.5072, 4326)::extensions.geography, 'published'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Secret draft',
   now() + interval '2 days', extensions.st_point(-0.1276, 51.5072, 4326)::extensions.geography, 'draft'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'Far away',
   now() + interval '1 day', extensions.st_point(2.3522, 48.8566, 4326)::extensions.geography, 'published');

insert into public.posts (id, author_id, caption, status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'visible post', 'visible'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'pending post', 'pending');

-- ---------------------------------------------------------------- as alice
set local role authenticated;
select tests.sign_in('00000000-0000-0000-0000-00000000000a');

select tests.expect_error(
  $$insert into public.posts (author_id, caption) values ('00000000-0000-0000-0000-00000000000a', 'x')$$,
  'posts are created only through create_post()');

select tests.expect_error(
  $$insert into public.posts (author_id, caption, status) values ('00000000-0000-0000-0000-00000000000a', 'x', 'visible')$$,
  'a new post cannot skip moderation');
select tests.expect_error(
  $$insert into public.posts (author_id, caption) values ('00000000-0000-0000-0000-00000000000b', 'x')$$,
  'cannot post as someone else');
select tests.expect_error(
  $$update public.posts set status = 'visible' where id = '20000000-0000-0000-0000-000000000002'$$,
  'cannot change own post status');
select tests.expect_error(
  $$update public.posts set like_count = 1000 where id = '20000000-0000-0000-0000-000000000002'$$,
  'cannot change like count');

update public.posts set caption = 'edited' where id = '20000000-0000-0000-0000-000000000002';
select tests.expect_eq((select count(*) from public.posts where caption = 'edited'), 1, 'can edit own caption');

select tests.expect_eq((select count(*) from public.events), 3, 'organiser sees own draft plus published events');

-- PostGIS: published events within 10 km of central London.
select tests.expect_eq(
  (select count(*) from public.events
   where extensions.st_dwithin(location, extensions.st_point(-0.12, 51.5, 4326)::extensions.geography, 10000)
     and status = 'published'),
  1, 'nearby search finds only the London event');

-- Messaging
select tests.expect_eq(
  (select count(*) from (
     select public.start_direct_conversation('00000000-0000-0000-0000-00000000000b')
     union
     select public.start_direct_conversation('00000000-0000-0000-0000-00000000000b')) c),
  1, 'starting a chat twice returns the same conversation');

insert into public.messages (conversation_id, sender_id, body)
select id, '00000000-0000-0000-0000-00000000000a', 'hi bob' from public.conversations;

select tests.expect_error(
  $$insert into public.messages (conversation_id, sender_id, body)
    select id, '00000000-0000-0000-0000-00000000000b', 'spoofed' from public.conversations$$,
  'cannot send a message as someone else');
select tests.expect_error(
  $$select public.start_direct_conversation('00000000-0000-0000-0000-00000000000a')$$,
  'cannot start a chat with yourself');

-- Service-only tables
select tests.expect_error($$select count(*) from public.outbox$$, 'outbox is not readable');
select tests.expect_error($$select count(*) from public.interactions$$, 'interactions are not readable');
select tests.expect_error(
  $$update public.profiles set id = gen_random_uuid() where id = '00000000-0000-0000-0000-00000000000a'$$,
  'cannot change a profile id');
update public.profiles set username = 'alice' where id = '00000000-0000-0000-0000-00000000000a';
select tests.expect_eq((select count(*) from public.profiles where username = 'alice'), 1, 'can set own username');
select tests.expect_error(
  $$insert into public.outbox (topic, payload) values ('x', '{}')$$,
  'outbox is not writable');
select tests.expect_error(
  $$insert into public.interactions (user_id, kind) values ('00000000-0000-0000-0000-00000000000a', 'like')$$,
  'interactions are not writable by users');

-- ---------------------------------------------------------------- as bob
select tests.sign_in('00000000-0000-0000-0000-00000000000b');

select tests.expect_eq((select count(*) from public.posts), 1, 'others do not see pending posts');
select tests.expect_eq((select count(*) from public.events where status = 'draft'), 0, 'others do not see drafts');

update public.posts set caption = 'hacked' where id = '20000000-0000-0000-0000-000000000002';
select tests.expect_eq((select count(*) from public.posts where caption = 'hacked'), 0, 'cannot edit others'' posts');

select tests.expect_eq((select count(*) from public.messages), 1, 'recipient can read the message');

insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');

-- ---------------------------------------------------------------- as carol
select tests.sign_in('00000000-0000-0000-0000-00000000000c');

select tests.expect_eq((select count(*) from public.conversations), 0, 'outsiders cannot see the conversation');
select tests.expect_eq((select count(*) from public.messages), 0, 'outsiders cannot read messages');
select tests.expect_error(
  $$select public.start_direct_conversation('00000000-0000-0000-0000-00000000000b')$$,
  'a blocked user cannot start a chat');
select tests.expect_eq((select count(*) from public.blocks), 0, 'block lists are private');

insert into public.reports (reporter_id, target_type, target_id, reason)
values ('00000000-0000-0000-0000-00000000000c', 'post', '20000000-0000-0000-0000-000000000001', 'spam');
select tests.expect_error($$select count(*) from public.reports$$, 'reports are not readable by users');

-- ---------------------------------------------------------------- signed out
reset role;
set local role anon;
select tests.sign_in(null);
select tests.expect_error($$select count(*) from public.profiles$$, 'signed-out users cannot read profiles');
select tests.expect_error($$select count(*) from public.posts$$, 'signed-out users cannot read posts');
select tests.expect_error(
  $$select public.start_direct_conversation('00000000-0000-0000-0000-00000000000b')$$,
  'signed-out users cannot start chats');

-- ---------------------------------------------------------------- account deletion
reset role;
update public.posts set embedding = array_fill(0.1, array[384])::extensions.vector
where id = '20000000-0000-0000-0000-000000000001';
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select tests.expect_eq(
  (select count(*) from public.posts where author_id = '00000000-0000-0000-0000-00000000000a'),
  0, 'deleting an account deletes its posts');
select tests.expect_eq(
  (select count(*) from public.messages where sender_id = '00000000-0000-0000-0000-00000000000a'),
  0, 'deleting an account deletes its messages');

rollback;
