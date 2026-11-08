-- Uploads, create_post(), likes and outbox events. Rolled back at the end.
begin;

create schema tests;
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
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

-- Uploads: only under your own prefix.
insert into public.uploads (id, user_id, storage_key, content_type, size_bytes) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'uploads/00000000-0000-0000-0000-00000000000a/one', 'image/jpeg', 1000),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
   'uploads/00000000-0000-0000-0000-00000000000a/two', 'image/webp', 2000);
select tests.expect_error(
  $$insert into public.uploads (user_id, storage_key, content_type, size_bytes)
    values ('00000000-0000-0000-0000-00000000000a', 'uploads/00000000-0000-0000-0000-00000000000b/x', 'image/jpeg', 1)$$,
  'cannot register an upload under someone else''s prefix');
select tests.expect_error(
  $$insert into public.uploads (user_id, storage_key, content_type, size_bytes)
    values ('00000000-0000-0000-0000-00000000000a', 'uploads/00000000-0000-0000-0000-00000000000a/x', 'application/pdf', 1)$$,
  'only image types');

-- create_post
select tests.expect_error(
  $$select public.create_post(array[]::uuid[])$$, 'a post needs a photo');
select tests.expect_error(
  $$select public.create_post(array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001']::uuid[])$$,
  'no duplicate photos');

select set_config('tests.post', public.create_post(
  array['30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001']::uuid[],
  '  hello  ', null, 51.5, -0.12, 'London')::text, true);

select tests.expect_eq((select count(*) from public.posts where caption = 'hello' and status = 'pending'), 1,
  'post created pending with trimmed caption');
select tests.expect_eq(
  (select count(*) from public.post_media where position = 0 and storage_key like '%/two'), 1,
  'photos keep the given order');
select tests.expect_eq((select count(*) from public.uploads where used_at is not null), 2, 'uploads marked used');
select tests.expect_error(
  $$select public.create_post(array['30000000-0000-0000-0000-000000000001']::uuid[])$$,
  'an upload cannot be used twice');

-- Bob can't use Alice's upload, and can't see her pending post.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select tests.expect_eq((select count(*) from public.uploads), 0, 'uploads are private');
select tests.expect_eq((select count(*) from public.posts), 0, 'pending posts are private');
select tests.expect_error(
  $$insert into public.likes (post_id, user_id)
    values (current_setting('tests.post')::uuid, '00000000-0000-0000-0000-00000000000b')$$,
  'cannot like a post you cannot see');

-- Once visible, likes count up and down.
reset role;
update public.posts set status = 'visible';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into public.likes (post_id, user_id) select id, '00000000-0000-0000-0000-00000000000b' from public.posts;
select tests.expect_eq((select like_count from public.posts), 1, 'like counted');
delete from public.likes;
select tests.expect_eq((select like_count from public.posts), 0, 'unlike counted');

-- Outbox: the worker hears about new posts and deleted media.
reset role;
select tests.expect_eq((select count(*) from public.outbox where topic = 'post.created'), 1, 'post.created queued');
delete from public.posts;
select tests.expect_eq((select count(*) from public.outbox where topic = 'media.deleted'), 2, 'media.deleted queued per photo');

rollback;
