-- Settings and saved items are private to their owner. Rolled back at the end.
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
insert into public.posts (id, author_id, status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'visible');
insert into public.user_settings (user_id, push_messages) values ('00000000-0000-0000-0000-00000000000b', false);
insert into public.saved_posts (user_id, post_id) values
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select tests.expect_eq((select count(*) from public.user_settings), 0, 'others'' settings are hidden');
select tests.expect_eq((select count(*) from public.saved_posts), 0, 'others'' saved posts are hidden');
select tests.expect_error(
  $$insert into public.user_settings (user_id) values ('00000000-0000-0000-0000-00000000000b')$$,
  'cannot create settings for someone else');
select tests.expect_error(
  $$insert into public.saved_posts (user_id, post_id)
    values ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001')$$,
  'cannot save on someone else''s behalf');
update public.user_settings set push_messages = true;
update public.profiles set relationship_status = 'taken' where id = '00000000-0000-0000-0000-00000000000b';

insert into public.user_settings (user_id, messages_from) values ('00000000-0000-0000-0000-00000000000a', 'following');
insert into public.saved_posts (user_id, post_id)
  values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001');
update public.profiles set relationship_status = 'single' where id = '00000000-0000-0000-0000-00000000000a';
select tests.expect_eq((select count(*) from public.saved_posts), 1, 'own saved posts are visible');
select tests.expect_eq((select count(*) from public.profiles where relationship_status = 'single'), 1, 'status set');

reset role;
select tests.expect_eq(
  (select count(*) from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000b' and not push_messages),
  1, 'changing someone else''s settings does nothing');
select tests.expect_eq(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b' and relationship_status is null),
  1, 'changing someone else''s relationship status does nothing');

rollback;
