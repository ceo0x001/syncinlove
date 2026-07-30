-- ============================================================================
-- Tender that was earned, lost to a bug, and put back
--
-- A couple lost their whole history to an unconfirmed one-click button on the
-- dashboard. The tender is being restored, and the question is whether it counts
-- toward the Rich List.
--
-- It does. They earned it. It went because of a design error, not because of
-- anything they did, and recording it as an 'adjustment' would leave them ranked
-- below couples they were ahead of — the leaderboard telling a story about their
-- relationship that is untrue and that they cannot correct.
--
-- The honest way to do that is a reason that says what happened, counted as earned
-- because it WAS earned. Not by filing it as a 'reveal' there is no reveal for:
-- provenance in a ledger is the thing that makes it a ledger.
--
-- WHY THIS MIGRATION IS MOSTLY NOT ABOUT THAT
--
-- "Earned" was defined in four separate functions by copy-paste, and had already
-- drifted once — tender_earned counted ('reveal','solo') while the Rich List
-- counted ('reveal','solo','streak'), so a couple's own earned figure disagreed
-- with the number they were ranked on. Adding a fifth reason to four hand-kept
-- lists is how that drift becomes permanent.
--
-- So the list moves into one function and the four callers ask it. The same lesson
-- as pair_streak this morning, which was computed twice and would have paid tender
-- against a number the screen disagreed with: a rule with two homes has two
-- behaviours, and the one you did not change is the one that bites.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The new reason
-- ----------------------------------------------------------------------------

alter table public.tender_entries drop constraint if exists tender_entries_reason_check;
alter table public.tender_entries add constraint tender_entries_reason_check
  check (reason in (
    'reveal',      -- both answered: completion + accuracy
    'solo',        -- answered alone, window closed: completion only
    'streak',      -- a milestone
    'purchase',    -- debit, buying from the partner's menu
    'refund',      -- credit, the seller declined or cancelled
    'fulfilled',   -- credit, the seller delivered
    'adjustment',  -- manual correction. NOT counted as earned.
    'restored'     -- earned once, lost to a fault of ours, put back. IS earned.
  ));

comment on column public.tender_entries.reason is
  'Provenance. ''restored'' and ''adjustment'' are both granted by hand and differ in '
  'exactly one way: restored counts toward the Rich List because it was genuinely '
  'earned before something of ours destroyed it, adjustment does not because it was '
  'not. Never file a goodwill gift as restored to make somebody feel better — the '
  'leaderboard is the one place in this app where the number is a claim about a '
  'couple made to strangers.';


-- ----------------------------------------------------------------------------
-- One definition of earned
-- ----------------------------------------------------------------------------

create or replace function public.tender_earning_reasons()
returns text[]
language sql
immutable
as $$ select array['reveal', 'solo', 'streak', 'restored']::text[] $$;

comment on function public.tender_earning_reasons() is
  'The single source of truth for what the Rich List ranks on. Four functions used '
  'to carry their own copy of this list and two of them had already drifted apart.';

grant execute on function public.tender_earning_reasons() to authenticated;


-- ----------------------------------------------------------------------------
-- The four callers, each asking rather than remembering
-- ----------------------------------------------------------------------------

-- 1. Somebody's own earned total. Previously ('reveal','solo') — missing 'streak',
--    so a couple's own figure was lower than the one they were ranked on.
create or replace function public.tender_earned(p_user_id uuid default null)
returns int
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(sum(amount), 0)::int
  from public.tender_entries
  where pair_id = public.current_pair_id()
    and user_id = coalesce(p_user_id, auth.uid())
    and amount > 0
    and reason = any (public.tender_earning_reasons())
$$;

grant execute on function public.tender_earned(uuid) to authenticated;


-- 2. The public list.
--
-- Lifted verbatim from 0013 with one predicate swapped, rather than retyped. The
-- first attempt at this was written from memory and invented two label columns the
-- function does not have — create or replace would have refused the return-type
-- change, and had it not, rich_list() would have broken on a shape nobody checked.
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
   and t.reason = any (public.tender_earning_reasons())
   and (p_since is null or t.created_at >= p_since)
  group by e.pair_id
$$;

revoke all on function public.rich_list_rows(timestamptz) from public;
revoke all on function public.rich_list_rows(timestamptz) from anon, authenticated;


-- 3. Where a couple stands, and where they would stand. Only the earned predicate
--    changes; would_rank and the tie-break are 0015's, untouched.
create or replace function public.rich_list_me(p_window text default 'all')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_user    uuid := auth.uid();
  v_pair    uuid := public.current_pair_id();
  v_me      boolean;
  v_partner boolean;
  v_rank    int;
  v_earned  int;
  v_would   int;
  v_since   timestamptz;
  v_total   int;
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

  select coalesce(sum(t.amount), 0)::int
    into v_earned
  from public.tender_entries t
  where t.pair_id = v_pair
    and t.amount > 0
    and t.reason = any (public.tender_earning_reasons())
    and (p_window <> 'week' or t.created_at >= now() - interval '7 days');

  select p.created_at into v_since from public.pairs p where p.id = v_pair;

  select count(*) + 1
    into v_would
  from public.rich_list_rows(
    case when p_window = 'week' then now() - interval '7 days' else null end
  ) x
  where x.earned > 0
    and x.pair_id <> coalesce(v_pair, '00000000-0000-0000-0000-000000000000'::uuid)
    and (x.earned > v_earned
         or (x.earned = v_earned and x.since < coalesce(v_since, now())));

  select r.rank
    into v_rank
  from (
    select
      row_number() over (order by x.earned desc, x.since asc, x.pair_id) as rank,
      x.pair_id
    from public.rich_list_rows(
      case when p_window = 'week' then now() - interval '7 days' else null end
    ) x
    where x.earned > 0
  ) r
  where r.pair_id = v_pair;

  select count(*)
    into v_total
  from public.rich_list_rows(
    case when p_window = 'week' then now() - interval '7 days' else null end
  ) x
  where x.earned > 0;

  return jsonb_build_object(
    'opted_in',         coalesce(v_me, false),
    'partner_opted_in', coalesce(v_partner, false),
    'rank',             v_rank,
    'earned',           coalesce(v_earned, 0),
    'would_rank',       v_would,
    'listed_couples',   coalesce(v_total, 0)
  );
end;
$$;

grant execute on function public.rich_list_me(text) to authenticated;


-- 4. The admin economy panel. Same swap; nothing else about it changes.
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
                                where amount > 0 and reason = any (public.tender_earning_reasons())),
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

revoke all on function public.admin_economy() from public;
grant execute on function public.admin_economy() to authenticated;
