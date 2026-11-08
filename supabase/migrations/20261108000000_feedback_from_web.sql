-- The web version (web/, on Cloudflare Pages) sends feedback too, so a row can
-- say it came from the browser. Only widens the check; existing rows are untouched.

alter table public.feedback drop constraint feedback_platform_check;
alter table public.feedback add constraint feedback_platform_check check (platform in ('android', 'ios', 'web'));
