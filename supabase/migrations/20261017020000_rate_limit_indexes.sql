-- The API limits how often one person can post, upload, message, report and
-- create parties by counting their recent rows (backend/src/limits.ts); these
-- indexes keep those counts cheap. posts and uploads already have one.

create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index events_organiser_created_idx on public.events (organiser_id, created_at desc);
