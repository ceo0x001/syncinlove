-- Minimal stand-ins for the parts of Supabase the migration depends on, so the
-- real migration can be executed unmodified against a throwaway cluster.

create schema if not exists auth;

-- Mirrors the columns of Supabase's real auth.users that this app actually
-- reads. Keeping it faithful matters: the admin functions select created_at and
-- email_change, and a stub missing them fails here while working in production —
-- which is the least useful way for a test to disagree with reality.
--
-- email_change is the real column name for a pending address. `new_email` is
-- what supabase-js exposes it as, and confusing the two has already cost one
-- round trip in this project.
-- The TYPES matter as much as the names, and this is the second production
-- failure this stub has hidden.
--
-- Supabase declares email and email_change as varchar(255). Declaring them
-- `text` here made every RETURNS TABLE (email text) agree with the stub and
-- disagree with Supabase, which rejects the mismatch at runtime:
--
--   42804  Returned type character varying(255) does not match expected type text
--
-- That emptied the admin account list and stopped every cron nudge, and both
-- looked like empty results rather than errors. So the columns below mirror the
-- real types exactly — a stub that is easier to satisfy than production is worse
-- than no stub.
create table auth.users (
  id            uuid primary key,
  email         varchar(255),
  email_change  varchar(255),
  is_anonymous  boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Impersonation handle: `set sync.uid = '<uuid>'` to become that user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('sync.uid', true), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'sub', current_setting('sync.uid', true),
    'is_anonymous', coalesce(
      (select is_anonymous from auth.users where id = nullif(current_setting('sync.uid', true), '')::uuid),
      true
    )
  )
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
