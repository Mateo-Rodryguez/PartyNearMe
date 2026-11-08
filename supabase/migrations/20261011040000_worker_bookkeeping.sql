-- Bookkeeping for the background worker.

-- Outbox rows are claimed with a lease so two workers never process the same
-- row; failures keep the last error for debugging and retry up to 5 times.
alter table public.outbox
  add column locked_until timestamptz,
  add column last_error text;

drop index public.outbox_pending_idx;
create index outbox_pending_idx on public.outbox (id) where processed_at is null and attempts < 5;

-- What moderation flagged, when a post is hidden by it.
alter table public.posts add column moderation_labels text[];
