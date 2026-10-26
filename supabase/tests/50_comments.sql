-- Comments: who can write, see and delete them. Rolled back at the end.
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
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into public.posts (id, author_id, status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'visible'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'pending');
insert into public.comments (id, post_id, author_id, body, status) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'hello', 'visible'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'rude', 'hidden');

select tests.expect_eq((select comment_count from public.posts where id = '20000000-0000-0000-0000-000000000001'),
  1, 'only visible comments are counted');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select tests.expect_eq((select count(*) from public.comments), 1, 'hidden comments are hidden from others');
select tests.expect_error(
  $$insert into public.comments (post_id, author_id, body)
    values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'as b')$$,
  'cannot comment as someone else');
select tests.expect_error(
  $$insert into public.comments (post_id, author_id, body)
    values ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'early')$$,
  'cannot comment on a pending post');
select tests.expect_error(
  $$insert into public.comments (post_id, author_id, body, status)
    values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'x', 'visible')$$,
  'cannot set the status');
select tests.expect_error(
  $$update public.comments set body = 'edited'$$,
  'comments cannot be edited');
-- Deleting someone else's comment on someone else's post does nothing.
delete from public.comments where id = '30000000-0000-0000-0000-000000000001';
insert into public.comments (post_id, author_id, body)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'nice');

-- B, the post's author, can delete anyone's comment on it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
delete from public.comments where id = '30000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select tests.expect_eq((select count(*) from public.comments where status = 'hidden'), 1, 'authors see their hidden comments');

reset role;
select tests.expect_eq((select count(*) from public.comments where author_id = '00000000-0000-0000-0000-00000000000c'),
  1, 'others cannot delete a comment; the post author can');
select tests.expect_eq((select comment_count from public.posts where id = '20000000-0000-0000-0000-000000000001'),
  1, 'the count follows inserts and deletes');

rollback;
