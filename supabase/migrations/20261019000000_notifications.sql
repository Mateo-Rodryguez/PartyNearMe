-- In-app notifications (the bell on the Home tab).
--
-- They are worked out when read from the rows that already record each
-- activity (likes, follows, RSVPs, upcoming parties) instead of being copied
-- into a table of their own, so nothing can drift out of step: an unlike or
-- unfollow simply makes the notification go away. All of those rows are
-- already readable by signed-in users under RLS. A dedicated table can replace
-- this later if grouping or per-item read state is needed.

alter table public.profiles add column notifications_seen_at timestamptz;
grant update (notifications_seen_at) on public.profiles to authenticated;
-- The API's notifications query uses existing indexes: posts and events by owner, likes
-- and RSVPs by post and party through their primary keys, follows by followee.
