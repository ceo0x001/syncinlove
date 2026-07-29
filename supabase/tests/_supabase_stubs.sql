-- Minimal stand-ins for the parts of Supabase the migration depends on, so the
-- real migration can be executed unmodified against a throwaway cluster.

create schema if not exists auth;

create table auth.users (
  id            uuid primary key,
  email         text,
  is_anonymous  boolean not null default true
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
