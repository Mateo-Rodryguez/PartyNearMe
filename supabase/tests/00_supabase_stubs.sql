-- Minimal stand-ins for what a real Supabase database already has, so the
-- migrations can be tested on plain Postgres. Not applied to Supabase.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema extensions;
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- Same contract as Supabase: the signed-in user's id from the request's JWT.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth, extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
