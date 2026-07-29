-- ============================================================================
-- Phase 5: the Rich List
--
-- A public ranking of couples by tender EARNED — never held. Earned means
-- payouts and streak bonuses only, so moving tender between two wallets or
-- refunding a purchase changes nothing about where a couple sits. Ranking on
-- held balance would reward hoarding and, worse, make spending on each other
-- cost you position, which is the exact opposite of the point.
--
-- Two things this file is careful about.
--
-- Consent. A public list showing two first names is a public statement that
-- those two people are a couple. So appearing requires BOTH partners to opt in
-- individually, it defaults to off, and either one withdrawing removes the
-- couple immediately. The existing list_display choice governs how a person is
-- printed; this adds whether they appear at all, which the settings copy has
-- been promising without anything behind it.
--
-- Leakage. tender_entries is readable only by members of that pair, which is
-- right and stays that way. So the list cannot be a normal query — it is a
-- SECURITY DEFINER function that returns aggregates and display labels and
-- nothing else. No pair ids, no user ids, no ledger rows, no exact names unless
-- that person chose to show their name.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Opting in
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists list_opt_in boolean not null default false;

comment on column public.profiles.list_opt_in is
  'Whether this person agrees to appear on the Rich List. Both partners must '
  'say yes; either withdrawing removes the couple.';


/**
 * Rename yourself, and set both Rich List choices.
 *
 * Replaces the 0006 signature by adding p_list_opt_in. Every parameter stays
 * nullable and null still means "leave it alone", so a caller that only sends a
 * name does not silently reset the rest.
 *
 * The old three-argument version is dropped rather than left alongside this
 * one. `create or replace` only replaces an identical signature, so adding a
 * parameter would otherwise leave two overloads in place — and PostgREST cannot
 * resolve an ambiguous overload, so every call would start failing with
 * PGRST203 instead of doing anything.
 */
drop function if exists public.update_profile(text, text, text);

create or replace function public.update_profile(
  p_first_name   text,
  p_list_display text default null,
  p_list_alias   text default null,
  p_list_opt_in  boolean default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_first_name, ''));
  v_alias text := nullif(btrim(coalesce(p_list_alias, '')), '');
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'A name, or whatever you want to be called.' using errcode = '22023';
  end if;
  if p_list_display is not null
     and p_list_display not in ('name', 'initial', 'alias') then
    raise exception 'Unknown display choice.' using errcode = '22023';
  end if;
  if p_list_display = 'alias' and v_alias is null then
    raise exception 'Type the alias you want shown.' using errcode = '22023';
  end if;

  update public.profiles
  set first_name   = v_name,
      list_display = coalesce(p_list_display, list_display),
      list_alias   = case
                       when p_list_display = 'alias' then v_alias
                       when p_list_display is null then list_alias
                       else list_alias
                     end,
      list_opt_in  = coalesce(p_list_opt_in, list_opt_in)
  where id = v_user;
end;
$$;


-- ----------------------------------------------------------------------------
-- The list
-- ----------------------------------------------------------------------------

/**
 * Which pairs are eligible, and what they have earned.
 *
 * Eligibility is strict on purpose: a live pairing, exactly two current
 * members, and both of them opted in. A pair mid-invite or one somebody has
 * left is not a couple for these purposes.
 *
 * p_since bounds the window. Null means all time.
 */
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
    -- Both halves present and both consenting. count(*) filter is what makes
    -- one person's opt-in insufficient.
    having count(*) = 2
       and count(*) filter (where pr.list_opt_in) = 2
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


/**
 * The public list.
 *
 * p_window is 'week' (rolling seven days) or 'all'. Rolling rather than
 * calendar weeks: every pair keeps its own timezone and day_zero, so there is
 * no shared week boundary to reset on, and a rolling window is always
 * meaningful instead of near-empty every Monday morning.
 *
 * Returns labels, not names — each person's own list_display decides whether
 * that is their name, their initial, or an alias. is_mine lets the UI mark the
 * caller's own row without the caller having to identify anyone else.
 */
create or replace function public.rich_list(
  p_window text default 'all',
  p_limit  int  default 20
)
returns table (
  rank    int,
  label_a text,
  label_b text,
  earned  int,
  is_mine boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with rows as (
    select *
    from public.rich_list_rows(
      case when p_window = 'week' then now() - interval '7 days' else null end
    )
  ),
  ranked as (
    select
      r.pair_id,
      r.earned,
      -- Ties break on the older pairing first: stable between calls, and it
      -- never exposes a date.
      row_number() over (order by r.earned desc, r.since asc, r.pair_id) as rn
    from rows r
    where r.earned > 0
  )
  select
    ranked.rn::int,
    -- Ordered within the couple so the row reads the same on every render
    -- rather than shuffling per query plan.
    (array_agg(public.list_label(pm.user_id) order by pm.joined_at, pm.user_id))[1],
    (array_agg(public.list_label(pm.user_id) order by pm.joined_at, pm.user_id))[2],
    ranked.earned,
    public.is_pair_member(ranked.pair_id)
  from ranked
  join public.pair_members pm
    on pm.pair_id = ranked.pair_id
   and pm.left_at is null
  group by ranked.rn, ranked.earned, ranked.pair_id
  order by ranked.rn
  limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;


/**
 * Where the caller stands, whether or not they made the visible page.
 *
 * Being ranked 40th is information you should be able to see without paging
 * through 39 other couples. Returns opted_in so the UI can tell "not on the
 * list because you haven't joined" apart from "joined, nothing earned yet" —
 * two very different things to say to someone.
 */
create or replace function public.rich_list_me(p_window text default 'all')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_user uuid := auth.uid();
  v_pair uuid := public.current_pair_id();
  v_me boolean;
  v_partner boolean;
  v_rank int;
  v_earned int;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  select coalesce(bool_or(pr.id = v_user and pr.list_opt_in), false),
         coalesce(bool_or(pr.id <> v_user and pr.list_opt_in), false)
    into v_me, v_partner
  from public.pair_members pm
  join public.profiles pr on pr.id = pm.user_id
  where pm.pair_id = v_pair
    and pm.left_at is null;

  select r.rank, r.earned
    into v_rank, v_earned
  from (
    select
      row_number() over (order by x.earned desc, x.since asc, x.pair_id) as rank,
      x.earned,
      x.pair_id
    from public.rich_list_rows(
      case when p_window = 'week' then now() - interval '7 days' else null end
    ) x
    where x.earned > 0
  ) r
  where r.pair_id = v_pair;

  return jsonb_build_object(
    'opted_in',         coalesce(v_me, false),
    'partner_opted_in', coalesce(v_partner, false),
    'rank',             v_rank,
    'earned',           coalesce(v_earned, 0)
  );
end;
$$;


-- rich_list_rows stays internal: it returns pair ids, which nothing outside
-- these two wrappers has any business seeing.
--
-- Revoked from PUBLIC specifically, not just from authenticated and anon.
-- Postgres grants EXECUTE to PUBLIC on every new function, so revoking the two
-- named roles leaves that inherited grant untouched and the function still
-- reachable over the API. The wrappers are SECURITY DEFINER and owned by the
-- same role, so they can still call it.
revoke all on function public.rich_list_rows(timestamptz) from public;
revoke all on function public.rich_list_rows(timestamptz) from authenticated, anon;

grant execute on function public.update_profile(text, text, text, boolean) to authenticated;
grant execute on function public.rich_list(text, int)                     to authenticated;
grant execute on function public.rich_list_me(text)                       to authenticated;
