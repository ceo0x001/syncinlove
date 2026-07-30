-- ============================================================================
-- The admin dashboard.
--
-- This is a deliberate exception to the rule the rest of the schema is built
-- around, so it is worth being precise about how far it goes.
--
-- WHAT IT CANNOT DO
--
-- Nothing here returns anything anybody wrote. No answers, no menu item titles,
-- no letter titles or bodies, no reveal payloads. Users are told "neither of you
-- sees anything until you both have" and "only you write this, and only you price
-- it", and an admin able to read those would make both statements untrue while
-- nobody knew. Every function below returns counts, dates, and account metadata.
--
-- If moderation of explicit menu items becomes a real need, the answer is a
-- report button that surfaces the single reported item — not blanket browsing.
--
-- WHY NOT A SERVICE_ROLE KEY
--
-- Because it would hand the web app the ability to read everything, forever, to
-- power a dashboard that needs almost none of it. The app holds the anon key and
-- nothing else. These are SECURITY DEFINER functions that each check admin
-- status inside the database and return only their own narrow result, so a
-- compromise of the app yields the anon key and still cannot read content.
--
-- WHY ADMINS LIVE IN THEIR OWN TABLE
--
-- A boolean on `profiles` would put admin one careless column away from
-- update_profile, which users can already call. A separate table with RLS on and
-- no policies at all has no write path through the API whatsoever: granting
-- admin is a SQL-only act.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Who is an admin
-- ----------------------------------------------------------------------------

create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note       text
);

alter table public.admins enable row level security;

-- No policies, deliberately. RLS with zero policies denies everything, so this
-- table is invisible and unwritable through the API. The revokes are belt and
-- braces.
revoke all on table public.admins from anon, authenticated;

comment on table public.admins is
  'Admin grants. No RLS policies exist on purpose — there is no path through the '
  'API to grant admin, only SQL.';


/**
 * Is the caller an admin?
 *
 * Safe to expose: it answers only about the caller, so it leaks nothing about
 * anybody else. The app needs it to decide which UI to render.
 */
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

grant execute on function public.is_admin() to authenticated;


/** Raises unless the caller is an admin. Every function below opens with this. */
create or replace function public.require_admin()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.require_admin() from public;
revoke all on function public.require_admin() from anon, authenticated;


-- ----------------------------------------------------------------------------
-- Overview
-- ----------------------------------------------------------------------------

/** Headline counts. Nothing here is content. */
create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'users',              (select count(*) from auth.users),
    'users_confirmed',    (select count(*) from auth.users where email is not null and email <> ''),
    'users_anonymous',    (select count(*) from auth.users where coalesce(is_anonymous, false)),
    'profiles',           (select count(*) from public.profiles),
    'pairs_total',        (select count(*) from public.pairs),
    'pairs_active',       (select count(*) from public.pairs where status = 'active'),
    'pairs_pending',      (select count(*) from public.pairs where status = 'pending'),
    'pairs_ended',        (select count(*) from public.pairs where status = 'ended'),
    -- A pairing with both halves present and neither having left.
    'pairs_complete',     (select count(*) from (
                             select pair_id from public.pair_members
                             where left_at is null group by pair_id having count(*) = 2
                           ) x),
    'reveals_total',      (select count(*) from public.reveals),
    'reveals_today',      (select count(*) from public.reveals
                             where revealed_at >= current_date),
    'reveals_7d',         (select count(*) from public.reveals
                             where revealed_at >= now() - interval '7 days'),
    'signups_7d',         (select count(*) from auth.users
                             where created_at >= now() - interval '7 days'),
    'signups_30d',        (select count(*) from auth.users
                             where created_at >= now() - interval '30 days'),
    'rich_list_opted_in', (select count(*) from public.profiles where list_opt_in),
    'letters_sealed',     (select count(*) from public.letters where opened_at is null),
    'letters_opened',     (select count(*) from public.letters where opened_at is not null)
  ) into v;

  return v;
end;
$$;


-- ----------------------------------------------------------------------------
-- Retention
--
-- The number that says whether the product works. A pair "reached day N" when it
-- has N completed days — reveals, meaning both people answered.
-- ----------------------------------------------------------------------------

create or replace function public.admin_retention()
returns table (milestone int, pairs bigint)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  perform public.require_admin();

  return query
  with completed as (
    select pair_id, count(*) as days
    from public.reveals
    group by pair_id
  )
  select m.n, (select count(*) from completed c where c.days >= m.n)
  from (values (1), (3), (7), (14), (30), (60), (90)) as m(n)
  order by m.n;
end;
$$;


-- ----------------------------------------------------------------------------
-- Accounts
--
-- Metadata only: who exists, whether they can get back in, and how active they
-- are. Deliberately no join to answers content or menu titles.
-- ----------------------------------------------------------------------------

create or replace function public.admin_accounts(
  p_search text default null,
  p_limit  int  default 100
)
returns table (
  user_id       uuid,
  first_name    text,
  email         text,
  pending_email text,
  confirmed     boolean,
  is_anonymous  boolean,
  is_admin      boolean,
  created_at    timestamptz,
  pair_status   text,
  has_partner   boolean,
  completed_days bigint,
  last_active   timestamptz,
  opted_in      boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  perform public.require_admin();

  return query
  select
    u.id,
    p.first_name,
    u.email,
    u.email_change,
    (u.email is not null and u.email <> ''),
    coalesce(u.is_anonymous, false),
    exists (select 1 from public.admins a where a.user_id = u.id),
    u.created_at,
    pr.status,
    (select count(*) from public.pair_members pm2
       where pm2.pair_id = pm.pair_id and pm2.left_at is null) = 2,
    (select count(*) from public.reveals r where r.pair_id = pm.pair_id),
    (select max(a.submitted_at) from public.answers a where a.user_id = u.id),
    coalesce(p.list_opt_in, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.pair_members pm on pm.user_id = u.id and pm.left_at is null
  left join public.pairs pr on pr.id = pm.pair_id
  where p_search is null
     or p_search = ''
     or u.email ilike '%' || p_search || '%'
     or u.email_change ilike '%' || p_search || '%'
     or p.first_name ilike '%' || p_search || '%'
  order by u.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;


-- ----------------------------------------------------------------------------
-- Economy and nudge health
-- ----------------------------------------------------------------------------

create or replace function public.admin_economy()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'tender_in_circulation', (select coalesce(sum(amount), 0) from public.tender_entries),
    'tender_earned_total',   (select coalesce(sum(amount), 0) from public.tender_entries
                                where amount > 0 and reason in ('reveal','solo','streak')),
    -- Count and average only. Never the titles.
    'menu_items_active',     (select count(*) from public.menu_items where active),
    'menu_price_avg',        (select coalesce(round(avg(price)), 0) from public.menu_items where active),
    'purchases_requested',   (select count(*) from public.purchases where status = 'requested'),
    'purchases_fulfilled',   (select count(*) from public.purchases where status = 'fulfilled'),
    'purchases_declined',    (select count(*) from public.purchases where status = 'declined')
  ) into v;

  return v;
end;
$$;


create or replace function public.admin_nudges()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'sent_total',   (select count(*) from public.notifications where sent_at is not null),
    'sent_today',   (select count(*) from public.notifications where sent_at >= current_date),
    'claimed_unsent', (select count(*) from public.notifications where sent_at is null),
    'by_kind',      (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
                       from (select kind, count(*) as n from public.notifications
                             where sent_at is not null group by kind) k),
    'reminders_off', (select count(*) from public.profiles where not notify_reminders),
    'partner_off',   (select count(*) from public.profiles where not notify_partner),
    'requests_off',  (select count(*) from public.profiles where not notify_requests)
  ) into v;

  return v;
end;
$$;


-- ----------------------------------------------------------------------------
-- Actions
-- ----------------------------------------------------------------------------

/**
 * Delete an account.
 *
 * Carries the same guard the manual cleanup script needed: a pairing is only
 * removed when every remaining member of it is also being removed. Otherwise the
 * partner is unpaired and their own history is left intact — tidying up one
 * account must never cost somebody else theirs.
 */
create or replace function public.admin_delete_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair uuid;
  v_others int;
  v_pair_deleted boolean := false;
begin
  perform public.require_admin();

  if p_user_id = auth.uid() then
    raise exception 'Deleting your own admin account from here is not allowed.'
      using errcode = '22023';
  end if;

  select pm.pair_id into v_pair
  from public.pair_members pm
  where pm.user_id = p_user_id and pm.left_at is null
  limit 1;

  if v_pair is not null then
    select count(*) into v_others
    from public.pair_members
    where pair_id = v_pair and left_at is null and user_id <> p_user_id;

    if v_others = 0 then
      -- Nobody else in it. Removing the pair clears everything hanging off it.
      delete from public.pairs where id = v_pair;
      v_pair_deleted := true;
    else
      -- Somebody real is still in there. Leave their pairing and history alone.
      update public.pair_members
      set left_at = now()
      where pair_id = v_pair and user_id = p_user_id;
    end if;
  end if;

  delete from auth.users where id = p_user_id;

  return jsonb_build_object('deleted', true, 'pair_deleted', v_pair_deleted);
end;
$$;


/** End a pairing without deleting anybody. */
create or replace function public.admin_unpair(p_pair_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  update public.pair_members set left_at = now()
  where pair_id = p_pair_id and left_at is null;

  update public.pairs set status = 'ended' where id = p_pair_id;
end;
$$;


/** Grant or revoke admin. Cannot be used to remove your own last grant. */
create or replace function public.admin_set_admin(p_user_id uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining int;
begin
  perform public.require_admin();

  if p_admin then
    insert into public.admins (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  else
    select count(*) into v_remaining from public.admins where user_id <> p_user_id;
    if v_remaining = 0 then
      raise exception 'That is the last admin — promote somebody else first.'
        using errcode = '22023';
    end if;
    delete from public.admins where user_id = p_user_id;
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- Grants
--
-- Every function that returns cross-user data is revoked from PUBLIC as well as
-- from the named roles. Postgres grants EXECUTE to PUBLIC on every new function,
-- so revoking only anon and authenticated would leave them reachable — the same
-- trap nudge_queue and rich_list_rows each had.
--
-- They then get granted back to `authenticated`, because an admin IS an
-- authenticated user. The gate is require_admin() inside each function, not the
-- grant — the grant alone could never distinguish an admin from anybody else.
-- ----------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_overview()',
    'public.admin_retention()',
    'public.admin_accounts(text,int)',
    'public.admin_economy()',
    'public.admin_nudges()',
    'public.admin_delete_account(uuid)',
    'public.admin_unpair(uuid)',
    'public.admin_set_admin(uuid,boolean)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;


-- ----------------------------------------------------------------------------
-- The first admin
-- ----------------------------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users
  where lower(email) = 'me@emmanuelemenike.com'
  limit 1;

  if v_id is null then
    raise notice 'no account found for me@emmanuelemenike.com — sign up with that address, then run: insert into public.admins (user_id) select id from auth.users where lower(email) = ''me@emmanuelemenike.com'';';
  else
    insert into public.admins (user_id, note) values (v_id, 'first admin')
    on conflict (user_id) do nothing;
    raise notice 'admin granted to me@emmanuelemenike.com';
  end if;
end;
$$;
