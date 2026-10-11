-- RSVP rules. Rolled back at the end.
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
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

insert into public.events (id, organiser_id, title, starts_at, location, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Open',
   now() + interval '1 day', extensions.st_point(0, 0, 4326)::extensions.geography, 'published'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Draft',
   now() + interval '1 day', extensions.st_point(0, 0, 4326)::extensions.geography, 'draft'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'Cancelled',
   now() + interval '1 day', extensions.st_point(0, 0, 4326)::extensions.geography, 'cancelled');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);

insert into public.rsvps (event_id, user_id, status)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'going');

select tests.expect_error(
  $$insert into public.rsvps (event_id, user_id, status)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'going')$$,
  'cannot RSVP to a draft');
select tests.expect_error(
  $$insert into public.rsvps (event_id, user_id, status)
    values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'going')$$,
  'cannot RSVP to a cancelled event');
select tests.expect_error(
  $$update public.rsvps set event_id = '10000000-0000-0000-0000-000000000002'$$,
  'cannot move an RSVP to another event');

update public.rsvps set status = 'interested';

rollback;
