-- Profile pictures and party cover photos.
--
-- Both go through the same upload flow as posts: the phone uploads to R2, the
-- API queues 'image.uploaded', and the worker makes the sizes, runs moderation
-- and only then sets avatar_key / cover_key. Clients can no longer set those
-- columns directly, so nothing unchecked is ever shown.

alter table public.profiles add column avatar_variants jsonb;
alter table public.events add column cover_variants jsonb;

revoke update on public.profiles from authenticated;
grant update (username, display_name, bio) on public.profiles to authenticated;

revoke update on public.events from authenticated;
grant update (title, description, starts_at, ends_at, venue_name, location, status) on public.events to authenticated;

-- Deleting an account or a party queues its picture's files for deletion.
create function public.outbox_avatar_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox (topic, payload)
  values ('media.deleted', jsonb_build_object('storage_key', old.avatar_key, 'variants', old.avatar_variants));
  return null;
end;
$$;

create function public.outbox_cover_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox (topic, payload)
  values ('media.deleted', jsonb_build_object('storage_key', old.cover_key, 'variants', old.cover_variants));
  return null;
end;
$$;

revoke execute on function public.outbox_avatar_deleted() from public, anon, authenticated;
revoke execute on function public.outbox_cover_deleted() from public, anon, authenticated;

create trigger profiles_avatar_outbox
  after delete on public.profiles
  for each row when (old.avatar_key is not null)
  execute function public.outbox_avatar_deleted();

create trigger events_cover_outbox
  after delete on public.events
  for each row when (old.cover_key is not null)
  execute function public.outbox_cover_deleted();
