-- Photo uploads, post creation, likes, and the outbox events the worker acts on.
--
-- Upload flow: the API signs a short-lived URL, the phone uploads straight to
-- R2, then create_post() turns finished uploads into a post in one step.
-- Posts start 'pending'; the worker makes thumbnails, runs moderation and
-- marks them 'visible'.

create table public.uploads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  storage_key  text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes   integer not null check (size_bytes between 1 and 15728640),
  created_at   timestamptz not null default now(),
  used_at      timestamptz
);
create index uploads_user_idx on public.uploads (user_id, created_at desc);

alter table public.uploads enable row level security;

-- Users register their own uploads, under their own key prefix only.
create policy uploads_select on public.uploads for select to authenticated
  using (user_id = (select auth.uid()));
create policy uploads_insert on public.uploads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and storage_key like 'uploads/' || (select auth.uid())::text || '/%'
    and used_at is null
  );

grant select, insert on public.uploads to authenticated;
grant all on public.uploads to service_role;

-- ---------------------------------------------------------------------------
-- Creating posts
-- ---------------------------------------------------------------------------

-- Creates a pending post from 1-10 of the caller's unused uploads (in the
-- given order) and marks them used. Fails if any upload isn't the caller's,
-- was already used, or is older than a day.
create function public.create_post(
  p_upload_ids uuid[],
  p_caption    text default null,
  p_event_id   uuid default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_place_name text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post uuid;
  found_count integer;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_upload_ids is null or cardinality(p_upload_ids) not between 1 and 10 then
    raise exception 'a post needs 1 to 10 photos' using errcode = '22023';
  end if;
  if (select count(distinct u) from unnest(p_upload_ids) u) <> cardinality(p_upload_ids) then
    raise exception 'duplicate photo' using errcode = '22023';
  end if;
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'lat and lng go together' using errcode = '22023';
  end if;
  -- The event must be one the caller can see.
  if p_event_id is not null and not exists (
    select 1 from public.events e
    where e.id = p_event_id and (e.status in ('published', 'cancelled') or e.organiser_id = me)
  ) then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  -- Lock the uploads so two requests can't use the same one.
  select count(*) into found_count
  from (
    select 1 from public.uploads u
    where u.id = any (p_upload_ids)
      and u.user_id = me
      and u.used_at is null
      and u.created_at > now() - interval '1 day'
    for update
  ) usable;
  if found_count <> cardinality(p_upload_ids) then
    raise exception 'photo not found or already used' using errcode = 'P0002';
  end if;

  insert into public.posts (author_id, event_id, caption, location, place_name)
  values (
    me, p_event_id, nullif(btrim(p_caption), ''),
    case when p_lat is not null then
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    end,
    nullif(btrim(p_place_name), '')
  )
  returning id into post;

  insert into public.post_media (post_id, position, storage_key)
  select post, (ord - 1)::smallint, u.storage_key
  from unnest(p_upload_ids) with ordinality as ids (upload_id, ord)
  join public.uploads u on u.id = ids.upload_id;

  update public.uploads set used_at = now() where id = any (p_upload_ids);

  return post;
end;
$$;

revoke execute on function public.create_post(uuid[], text, uuid, double precision, double precision, text) from public, anon;
grant execute on function public.create_post(uuid[], text, uuid, double precision, double precision, text) to authenticated, service_role;

-- Posts are created only through create_post().
revoke insert on public.posts from authenticated;

-- ---------------------------------------------------------------------------
-- Likes: only on visible posts; like_count kept in step by a trigger
-- ---------------------------------------------------------------------------

create function public.is_visible_post(post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.posts where id = post and status = 'visible');
$$;
revoke execute on function public.is_visible_post(uuid) from public, anon;
grant execute on function public.is_visible_post(uuid) to authenticated, service_role;

drop policy likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_visible_post(post_id));

create function public.update_like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.update_like_count() from public, anon, authenticated;

create trigger likes_count
  after insert or delete on public.likes
  for each row execute function public.update_like_count();

-- ---------------------------------------------------------------------------
-- Outbox events for the worker
-- ---------------------------------------------------------------------------

create function public.outbox_post_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox (topic, payload) values ('post.created', jsonb_build_object('post_id', new.id));
  return null;
end;
$$;

create function public.outbox_media_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox (topic, payload)
  values ('media.deleted', jsonb_build_object('storage_key', old.storage_key, 'variants', old.variants));
  return null;
end;
$$;

revoke execute on function public.outbox_post_created() from public, anon, authenticated;
revoke execute on function public.outbox_media_deleted() from public, anon, authenticated;

create trigger posts_outbox
  after insert on public.posts
  for each row execute function public.outbox_post_created();

-- Deleting a post (or an account) cascades to its media; the worker then
-- removes the files from storage.
create trigger post_media_outbox
  after delete on public.post_media
  for each row execute function public.outbox_media_deleted();
