-- ============================================================================
-- Suspension, partner visibility, and the rest of what an operator actually
-- needs.
--
-- Suspension is enforced with a TRIGGER rather than by editing submit_answer,
-- buy_menu_item, seal_letter and upsert_menu_item one at a time. Those are large
-- SECURITY DEFINER functions and adding a guard to each is four chances to miss
-- one — and a suspension that blocks three of four write paths is not a
-- suspension. A trigger on the tables catches every route in, including any
-- added later.
--
-- Note that auth.uid() still resolves inside a SECURITY DEFINER function: it
-- reads the request's JWT claim, not the current role. So a trigger firing during
-- submit_answer still knows who the actual caller is.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The flag
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

comment on column public.profiles.suspended_at is
  'Set by an admin. A suspended account can still sign in and read its own '
  'history, but cannot write anything new — the point is to stop somebody, not '
  'to erase them.';


-- ----------------------------------------------------------------------------
-- Enforcement
-- ----------------------------------------------------------------------------

/**
 * Refuses a write from a suspended account.
 *
 * Deliberately blocks writing, not reading. A suspended person keeps access to
 * their own history and their own export — suspension is not a way to
 * confiscate what somebody already wrote, and the export exists precisely so
 * that leaving is always possible.
 */
create or replace function public.block_if_suspended()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_when timestamptz;
begin
  if auth.uid() is null then
    return new;      -- a job or a migration, not a person
  end if;

  select suspended_at into v_when from public.profiles where id = auth.uid();

  if v_when is not null then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists answers_not_suspended    on public.answers;
drop trigger if exists purchases_not_suspended  on public.purchases;
drop trigger if exists letters_not_suspended    on public.letters;
drop trigger if exists menu_items_not_suspended on public.menu_items;

create trigger answers_not_suspended
  before insert on public.answers
  for each row execute function public.block_if_suspended();

create trigger purchases_not_suspended
  before insert on public.purchases
  for each row execute function public.block_if_suspended();

create trigger letters_not_suspended
  before insert on public.letters
  for each row execute function public.block_if_suspended();

create trigger menu_items_not_suspended
  before insert or update on public.menu_items
  for each row execute function public.block_if_suspended();


-- ----------------------------------------------------------------------------
-- A suspended couple leaves the Rich List, and stops being nudged
--
-- Both are consequences of suspension rather than separate settings: a public
-- leaderboard should not carry somebody an operator has stopped, and mailing a
-- daily reminder to an account that cannot answer is just noise.
-- ----------------------------------------------------------------------------

create or replace function public.rich_list_rows(p_since timestamptz)
returns table (
  pair_id  uuid,
  earned   int,
  since    timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with eligible as (
    select pm.pair_id
    from public.pair_members pm
    join public.pairs p on p.id = pm.pair_id
    join public.profiles pr on pr.id = pm.user_id
    where pm.left_at is null
      and p.status <> 'ended'
    group by pm.pair_id
    having count(*) = 2
       and count(*) filter (where pr.list_opt_in) = 2
       -- Neither half suspended.
       and count(*) filter (where pr.suspended_at is not null) = 0
  )
  select
    e.pair_id,
    coalesce(sum(t.amount), 0)::int as earned,
    min(p.created_at)               as since
  from eligible e
  join public.pairs p on p.id = e.pair_id
  left join public.tender_entries t
    on t.pair_id = e.pair_id
   and t.amount > 0
   and t.reason in ('reveal', 'solo', 'streak')
   and (p_since is null or t.created_at >= p_since)
  group by e.pair_id
$$;

revoke all on function public.rich_list_rows(timestamptz) from public;
revoke all on function public.rich_list_rows(timestamptz) from authenticated, anon;


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
      u.email,
      (select pm2.user_id from public.pair_members pm2
        where pm2.pair_id = l.pair_id and pm2.user_id <> pm.user_id
          and pm2.left_at is null limit 1) as partner_id
    from live l
    join public.pair_members pm on pm.pair_id = l.pair_id and pm.left_at is null
    join public.profiles pr on pr.id = pm.user_id
    join auth.users u on u.id = pm.user_id
    where u.email is not null
      and u.email <> ''
      -- Nothing is owed to an account that cannot answer.
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
-- Am I suspended? The app needs to be able to say so plainly.
-- ----------------------------------------------------------------------------

create or replace function public.my_suspension()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when p.suspended_at is null then jsonb_build_object('suspended', false)
    else jsonb_build_object(
      'suspended', true,
      'since', p.suspended_at,
      'reason', p.suspended_reason
    )
  end
  from public.profiles p
  where p.id = auth.uid()
$$;

grant execute on function public.my_suspension() to authenticated;


-- ----------------------------------------------------------------------------
-- Admin: suspend, and see the pairing
-- ----------------------------------------------------------------------------

create or replace function public.admin_set_suspended(
  p_user_id uuid,
  p_suspend boolean,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  if p_user_id = auth.uid() then
    raise exception 'Suspending your own admin account is not allowed.'
      using errcode = '22023';
  end if;

  update public.profiles
  set suspended_at = case when p_suspend then coalesce(suspended_at, now()) else null end,
      suspended_reason = case when p_suspend then nullif(btrim(coalesce(p_reason, '')), '') else null end
  where id = p_user_id;
end;
$$;


/**
 * The account list, now with who each person is actually paired with.
 *
 * Still metadata: a partner's name and address, which an operator needs to make
 * sense of a support request, and the pair id so a pairing can be ended. No
 * answers, no menu titles, no letters — the promise that nothing anybody wrote
 * appears here is unchanged.
 */
-- Dropped rather than replaced: `create or replace` cannot change a function's
-- return type, and this one gains the partner columns.
drop function if exists public.admin_accounts(text, int);

create function public.admin_accounts(
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
    u.email,
    u.email_change,
    (u.email is not null and u.email <> ''),
    coalesce(u.is_anonymous, false),
    exists (select 1 from public.admins a where a.user_id = u.id),
    p.suspended_at,
    p.suspended_reason,
    u.created_at,
    pm.pair_id,
    pr.status,
    partner.first_name,
    pu.email,
    (select count(*) from public.reveals r where r.pair_id = pm.pair_id),
    (select max(a.submitted_at) from public.answers a where a.user_id = u.id),
    coalesce(p.list_opt_in, false)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.pair_members pm on pm.user_id = u.id and pm.left_at is null
  left join public.pairs pr on pr.id = pm.pair_id
  -- The other half of the pairing, if there is one.
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


do $$
declare fn text;
begin
  foreach fn in array array[
    'public.admin_accounts(text,int)',
    'public.admin_set_suspended(uuid,boolean,text)'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
