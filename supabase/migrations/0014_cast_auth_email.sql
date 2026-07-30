-- ============================================================================
-- auth.users.email is varchar(255), not text.
--
-- Two functions declared `email text` in a RETURNS TABLE and then selected
-- auth.users.email straight into it. Postgres checks that shape at runtime and
-- refuses:
--
--   42804  structure of query does not match function result type
--          Returned type character varying(255) does not match expected type text
--
-- Which is why the admin account list came back empty. .rpc() does not throw —
-- it returns {data: null, error} — so a failing query rendered identically to a
-- database with nobody in it, and I spent two rounds looking at the layout.
--
-- nudge_queue has exactly the same declaration, so it was failing too. That one
-- fails silently in a different way: send_nudges() loops over it, so the loop
-- raised and no nudge has ever gone out through the cron job. The only email
-- that arrived was the hand-rolled http_post test, which bypassed the queue
-- entirely — so "it works" was true of the Resend leg and false of the feature.
--
-- Both are fixed by casting explicitly. The real fix is in the test stub, which
-- declared email as `text` and therefore agreed with the code rather than with
-- Supabase — the second time that stub has hidden a production failure.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- nudge_queue
-- ----------------------------------------------------------------------------

create or replace function public.nudge_queue(p_evening_hour int default 20)
returns table (
  pair_id    uuid,
  user_id    uuid,
  email      text,
  first_name text,
  kind       text,
  day_index  int,
  partner_first_name text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with live as (
    select
      p.id as pair_id,
      p.time_zone,
      p.day_zero,
      public.pair_day_index(p.id) as today,
      extract(hour from (now() at time zone p.time_zone))::int as local_hour
    from public.pairs p
    where p.status <> 'ended'
      and (select count(*) from public.pair_members pm
           where pm.pair_id = p.id and pm.left_at is null) = 2
  ),
  people as (
    select
      l.*,
      pm.user_id,
      pr.first_name,
      pr.notify_reminders,
      pr.notify_partner,
      pr.notify_requests,
      -- The cast that was missing.
      u.email::text as email,
      (select pm2.user_id from public.pair_members pm2
        where pm2.pair_id = l.pair_id and pm2.user_id <> pm.user_id
          and pm2.left_at is null limit 1) as partner_id
    from live l
    join public.pair_members pm on pm.pair_id = l.pair_id and pm.left_at is null
    join public.profiles pr on pr.id = pm.user_id
    join auth.users u on u.id = pm.user_id
    where u.email is not null
      and u.email <> ''
      and pr.suspended_at is null
  ),
  state as (
    select
      pe.*,
      (select true from public.answers a
        where a.pair_id = pe.pair_id and a.user_id = pe.user_id
          and a.day_index = pe.today limit 1) as i_answered,
      (select true from public.answers a
        where a.pair_id = pe.pair_id and a.user_id = pe.partner_id
          and a.day_index = pe.today limit 1) as they_answered,
      (select true from public.reveals r
        where r.pair_id = pe.pair_id and r.day_index = pe.today limit 1) as revealed,
      (select pr2.first_name from public.profiles pr2 where pr2.id = pe.partner_id)
        as partner_first_name
    from people pe
  ),
  candidates as (
    select s.pair_id, s.user_id, s.email, s.first_name,
           'partner_answered'::text as kind, s.today as day_index, s.partner_first_name
    from state s
    where s.notify_partner
      and coalesce(s.they_answered, false)
      and not coalesce(s.i_answered, false)
      and not coalesce(s.revealed, false)

    union all

    select s.pair_id, s.user_id, s.email, s.first_name,
           'closing_soon', s.today, s.partner_first_name
    from state s
    where s.notify_reminders
      and s.local_hour >= p_evening_hour
      and not coalesce(s.i_answered, false)

    union all

    select distinct s.pair_id, s.user_id, s.email, s.first_name,
           'request', null::int, s.partner_first_name
    from state s
    join public.purchases pu
      on pu.pair_id = s.pair_id
     and pu.seller_id = s.user_id
     and pu.status = 'requested'
    where s.notify_requests
  )
  select c.pair_id, c.user_id, c.email, c.first_name, c.kind, c.day_index,
         c.partner_first_name
  from candidates c
  where not exists (
    select 1 from public.notifications n
    where n.pair_id = c.pair_id
      and n.user_id = c.user_id
      and n.kind = c.kind
      and coalesce(n.day_index, -1) = coalesce(c.day_index, -1)
  )
$$;

revoke all on function public.nudge_queue(int) from public;
revoke all on function public.nudge_queue(int) from authenticated, anon;


-- ----------------------------------------------------------------------------
-- admin_accounts
-- ----------------------------------------------------------------------------

create or replace function public.admin_accounts(
  p_search text default null,
  p_limit  int  default 100
)
returns table (
  user_id        uuid,
  first_name     text,
  email          text,
  pending_email  text,
  confirmed      boolean,
  is_anonymous   boolean,
  is_admin       boolean,
  suspended_at   timestamptz,
  suspended_reason text,
  created_at     timestamptz,
  pair_id        uuid,
  pair_status    text,
  partner_name   text,
  partner_email  text,
  completed_days bigint,
  last_active    timestamptz,
  opted_in       boolean
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
    u.email::text,
    u.email_change::text,
    (u.email is not null and u.email <> ''),
    coalesce(u.is_anonymous, false),
    exists (select 1 from public.admins a where a.user_id = u.id),
    p.suspended_at,
    p.suspended_reason,
    u.created_at,
    pm.pair_id,
    pr.status::text,
    partner.first_name,
    pu.email::text,
    (select count(*) from public.reveals r where r.pair_id = pm.pair_id),
    (select max(a.submitted_at) from public.answers a where a.user_id = u.id),
    coalesce(p.list_opt_in, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.pair_members pm on pm.user_id = u.id and pm.left_at is null
  left join public.pairs pr on pr.id = pm.pair_id
  left join public.pair_members pmo
    on pmo.pair_id = pm.pair_id and pmo.user_id <> u.id and pmo.left_at is null
  left join public.profiles partner on partner.id = pmo.user_id
  left join auth.users pu on pu.id = pmo.user_id
  where p_search is null
     or p_search = ''
     or u.email ilike '%' || p_search || '%'
     or u.email_change ilike '%' || p_search || '%'
     or p.first_name ilike '%' || p_search || '%'
  order by u.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.admin_accounts(text, int) from public;
revoke all on function public.admin_accounts(text, int) from anon;
grant execute on function public.admin_accounts(text, int) to authenticated;
