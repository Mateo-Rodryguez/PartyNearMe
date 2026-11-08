-- Comments on posts, checks on edited captions, and telling guests when a
-- party is cancelled.
--
-- Comments show straight away, like on Instagram; the worker then runs the
-- text past moderation and hides any that aren't allowed. A hidden comment
-- stays visible to its author only.

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  status     text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now()
);
-- A post's comments, newest first; and each person's recent ones for rate limits.
create index comments_post_idx on public.comments (post_id, created_at desc, id desc);
create index comments_author_idx on public.comments (author_id, created_at desc);

alter table public.posts add column comment_count integer not null default 0 check (comment_count >= 0);

-- Whether the caller may comment on a post: it's visible and neither person
-- blocked the other. Security definer because blocks are only readable by the
-- person who made them.
create function public.can_comment(post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
    where p.id = post and p.status = 'visible'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p.author_id and b.blocked_id = (select auth.uid()))
           or (b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id)
      )
  );
$$;
revoke execute on function public.can_comment(uuid) from public, anon;
grant execute on function public.can_comment(uuid) to authenticated, service_role;

alter table public.comments enable row level security;
-- Visible comments on visible posts, plus your own whatever their state.
create policy comments_select on public.comments for select to authenticated
  using ((status = 'visible' and public.is_visible_post(post_id)) or author_id = (select auth.uid()));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and status = 'visible' and public.can_comment(post_id));
-- Authors delete their own comments; a post's author can delete any on it.
create policy comments_delete on public.comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );
grant select, delete on public.comments to authenticated;
grant insert (post_id, author_id, body) on public.comments to authenticated;
grant all on public.comments to service_role;

-- comment_count counts visible comments only, so hiding one takes it off.
create function public.update_comment_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was_counted boolean := tg_op in ('UPDATE', 'DELETE') and old.status = 'visible';
  is_counted boolean := tg_op in ('INSERT', 'UPDATE') and new.status = 'visible';
begin
  if was_counted and not is_counted then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  elsif is_counted and not was_counted then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.update_comment_count() from public, anon, authenticated;

create trigger comments_count
  after insert or delete or update of status on public.comments
  for each row execute function public.update_comment_count();

-- ---------------------------------------------------------------------------
-- Outbox events for the worker
-- ---------------------------------------------------------------------------

create function public.outbox_comment_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox (topic, payload) values ('comment.created', jsonb_build_object('comment_id', new.id));
  return null;
end;
$$;

-- An edited caption is checked again, as it was when the post was made.
create function public.outbox_caption_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.caption is not null and new.caption is distinct from old.caption then
    insert into public.outbox (topic, payload) values ('post.caption_changed', jsonb_build_object('post_id', new.id));
  end if;
  return null;
end;
$$;

-- Guests who said they're going or interested hear when a party is cancelled.
create function public.outbox_event_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status = 'published' then
    insert into public.outbox (topic, payload) values ('event.cancelled', jsonb_build_object('event_id', new.id));
  end if;
  return null;
end;
$$;

revoke execute on function public.outbox_comment_created() from public, anon, authenticated;
revoke execute on function public.outbox_caption_changed() from public, anon, authenticated;
revoke execute on function public.outbox_event_cancelled() from public, anon, authenticated;

create trigger comments_outbox
  after insert on public.comments
  for each row execute function public.outbox_comment_created();
create trigger posts_caption_outbox
  after update of caption on public.posts
  for each row execute function public.outbox_caption_changed();
create trigger events_cancelled_outbox
  after update of status on public.events
  for each row execute function public.outbox_event_cancelled();

-- ---------------------------------------------------------------------------
-- Settings and moderation
-- ---------------------------------------------------------------------------

alter table public.user_settings add column push_comments boolean not null default true;

-- Comments can be reported and acted on like everything else.
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'event', 'user', 'message', 'comment'));
alter table public.moderation_actions drop constraint moderation_actions_target_type_check;
alter table public.moderation_actions add constraint moderation_actions_target_type_check
  check (target_type in ('post', 'event', 'user', 'message', 'comment'));
