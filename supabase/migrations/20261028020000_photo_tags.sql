-- Tagging people in photos, like Instagram's "with @sam".
--
-- The post's author tags people, at posting time or later; anyone tagged can
-- take themselves off. Tagged people hear about it once the post is visible
-- (the worker checks new posts first), at most once per tag: notified_at
-- records it.

create table public.post_tags (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  primary key (post_id, user_id)
);
-- The posts someone is tagged in, for notifications.
create index post_tags_user_idx on public.post_tags (user_id, created_at desc);

-- Whether the caller may tag a person on a post: it's their post and neither
-- of them blocked the other. Security definer because blocks are only
-- readable by the person who made them.
create function public.can_tag(post uuid, person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
    where p.id = post and p.author_id = (select auth.uid()) and p.status in ('pending', 'visible')
  ) and not exists (
    select 1 from public.blocks b
    where (b.blocker_id = person and b.blocked_id = (select auth.uid()))
       or (b.blocker_id = (select auth.uid()) and b.blocked_id = person)
  );
$$;
revoke execute on function public.can_tag(uuid, uuid) from public, anon;
grant execute on function public.can_tag(uuid, uuid) to authenticated, service_role;

alter table public.post_tags enable row level security;
-- Tags show wherever the post does (posts' own policy decides that).
create policy post_tags_select on public.post_tags for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_tags_insert on public.post_tags for insert to authenticated
  with check (public.can_tag(post_id, user_id));
-- The author removes any tag on their post; a tagged person removes their own.
create policy post_tags_delete on public.post_tags for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );
grant select, delete on public.post_tags to authenticated;
grant insert (post_id, user_id) on public.post_tags to authenticated;
grant all on public.post_tags to service_role;

create function public.outbox_post_tagged() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox (topic, payload) values ('post.tagged', jsonb_build_object('post_id', new.post_id));
  return null;
end;
$$;
revoke execute on function public.outbox_post_tagged() from public, anon, authenticated;

create trigger post_tags_outbox
  after insert on public.post_tags
  for each row execute function public.outbox_post_tagged();
