-- ============================================================================
-- Freeze days
--
-- The last unbuilt item on the phase 5 plan. A streak currently ends the first
-- time a day closes unanswered, which means illness, travel, a dead phone or one
-- bad week all cost a couple the same thing: everything they had built. That is
-- the classic churn moment for a daily-habit product, and it punishes the
-- circumstance rather than the intent.
--
-- THE RULE THAT MAKES THIS SAFE
--
-- A freeze forgives a GAP. It never substitutes for an answer.
--
-- Frozen days bridge the run so it stays unbroken, and they add nothing to its
-- length. The 60-day milestone still requires 60 real reveals; it may now span 62
-- calendar days. So the tender economy is untouched by construction rather than by
-- a cap chosen carefully — there is no allowance, however generous, that turns
-- freezes into free money.
--
-- What the cap protects is meaning, not money. Without one, a couple answering
-- weekly would eventually show a 60-day streak, and the number would stop saying
-- anything. Two per calendar month is forgiving of a bad week and nowhere near
-- enough to make a weekly cadence look like a habit.
--
-- Applied automatically, and that is deliberate. A freeze you have to remember to
-- spend fails in exactly the situation it exists for: nobody opens the app on the
-- day they were too ill to open the app.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The record
--
-- One row per forgiven day. Pair-level, not per-person: the streak belongs to the
-- couple, so an allowance held by one partner and not the other would be a rule
-- nobody could reason about.
-- ----------------------------------------------------------------------------

create table if not exists public.streak_freezes (
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  day_index  int not null check (day_index >= 0),
  -- The calendar month the allowance was drawn from, stored rather than derived so
  -- the monthly count is a plain index lookup and cannot drift if day_zero is ever
  -- corrected.
  month      date not null,
  created_at timestamptz not null default now(),
  primary key (pair_id, day_index)
);

create index if not exists streak_freezes_month
  on public.streak_freezes (pair_id, month);

alter table public.streak_freezes enable row level security;

-- Readable by the couple it belongs to, because the UI has to be able to say "we
-- covered Tuesday" rather than silently changing the number. Writable by nobody:
-- freezes are granted by settle_freezes and there is no API path to mint one.
drop policy if exists streak_freezes_read on public.streak_freezes;
create policy streak_freezes_read
  on public.streak_freezes
  for select
  using (public.is_pair_member(pair_id));

grant select on public.streak_freezes to authenticated;


-- ----------------------------------------------------------------------------
-- How many are left this month
-- ----------------------------------------------------------------------------

create or replace function public.freeze_allowance()
returns int
language sql
immutable
as $$ select 2 $$;

comment on function public.freeze_allowance() is
  'Freezes per pairing per calendar month. A function rather than a literal so the '
  'number lives in one place and the tests assert against the same value the app uses.';


create or replace function public.freezes_left(p_pair_id uuid, p_on date default null)
returns int
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select greatest(
    0,
    public.freeze_allowance() - (
      select count(*)::int
      from public.streak_freezes f
      where f.pair_id = p_pair_id
        and f.month = date_trunc('month', coalesce(p_on, current_date))::date
    )
  )
$$;

grant execute on function public.freezes_left(uuid, date) to authenticated;


-- ----------------------------------------------------------------------------
-- The streak, now able to step over a forgiven day
--
-- The old version leant on reveals being dense: `gap = pos` holds only while every
-- day from the newest downward has a reveal, so the count stopped at the first
-- hole. That trick cannot express "this hole is forgiven", so the walk is now
-- explicit.
--
-- It counts reveals above the highest day that has neither a reveal nor a freeze.
-- Slower than the old form — proportional to the pairing's age rather than to its
-- reveals — which at a few hundred days is nothing, and is the price of the
-- feature.
-- ----------------------------------------------------------------------------

create or replace function public.pair_streak(p_pair_id uuid)
returns int
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with newest as (
    select max(day_index) as top
    from public.reveals
    where pair_id = p_pair_id
  ),
  days as (
    select generate_series(n.top, 0, -1) as day_index
    from newest n
    where n.top is not null
  ),
  marked as (
    select
      d.day_index,
      exists (
        select 1 from public.reveals r
        where r.pair_id = p_pair_id and r.day_index = d.day_index
      ) as revealed,
      exists (
        select 1 from public.streak_freezes f
        where f.pair_id = p_pair_id and f.day_index = d.day_index
      ) as frozen
    from days d
  ),
  -- The most recent day that broke the run. Everything at or below it is history.
  broken as (
    select max(day_index) as break_at
    from marked
    where not revealed and not frozen
  )
  select coalesce((
    select count(*)
    from marked
    where revealed
      and day_index > coalesce((select break_at from broken), -1)
  ), 0)::int
$$;

grant execute on function public.pair_streak(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- Granting them
--
-- Walks down from the newest reveal and forgives contiguous missed days while the
-- allowance for each day's own month holds out.
--
-- Two things it deliberately will not do.
--
-- It does not spend on history. It stops at the first day it cannot cover, because
-- below that point the run is already broken and a freeze there buys nothing —
-- spending the month's allowance on a gap that changes no number is the easiest
-- way to have none left when it matters.
--
-- It does not touch a day whose window is still open. That day is not missed yet,
-- and forgiving it early would quietly remove the reason to answer today.
-- ----------------------------------------------------------------------------

create or replace function public.settle_freezes(p_pair_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_top      int;
  v_zero     date;
  v_day      int;
  v_month    date;
  v_granted  int := 0;
  v_floor    int;
begin
  select max(day_index) into v_top from public.reveals where pair_id = p_pair_id;
  if v_top is null then
    return 0;
  end if;

  select day_zero into v_zero from public.pairs where id = p_pair_id;
  if v_zero is null then
    return 0;
  end if;

  -- Bounded. A pairing dormant for a year should not walk 365 rows to discover its
  -- streak ended last February, and nothing beyond roughly a month can be rescued
  -- by an allowance of two.
  v_floor := greatest(0, v_top - 45);

  v_day := v_top - 1;
  while v_day >= v_floor loop
    -- Already covered, either way. Keep walking: a run can legitimately contain a
    -- freeze granted on an earlier visit.
    if exists (select 1 from public.reveals where pair_id = p_pair_id and day_index = v_day)
       or exists (select 1 from public.streak_freezes where pair_id = p_pair_id and day_index = v_day)
    then
      v_day := v_day - 1;
      continue;
    end if;

    -- Not missed yet.
    if public.pair_day_is_open(p_pair_id, v_day) then
      exit;
    end if;

    v_month := date_trunc('month', (v_zero + v_day))::date;

    if public.freezes_left(p_pair_id, (v_zero + v_day)) <= 0 then
      -- The run ends here for good. Stop rather than spending later months'
      -- allowance on days below an unbridgeable gap.
      exit;
    end if;

    insert into public.streak_freezes (pair_id, day_index, month)
    values (p_pair_id, v_day, v_month)
    on conflict (pair_id, day_index) do nothing;

    v_granted := v_granted + 1;
    v_day := v_day - 1;
  end loop;

  return v_granted;
end;
$$;

revoke all on function public.settle_freezes(uuid) from public;
grant execute on function public.settle_freezes(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- What the UI needs to say
--
-- The number changing on its own is worse than the number ending. If a streak
-- survives a day nobody answered, the couple has to be told why, or the next
-- thing they conclude is that the count is arbitrary.
-- ----------------------------------------------------------------------------

create or replace function public.freeze_status()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select jsonb_build_object(
    'allowance', public.freeze_allowance(),
    'left',      coalesce(public.freezes_left(public.current_pair_id()), 0),
    'used_days', coalesce((
      select jsonb_agg(f.day_index order by f.day_index desc)
      from public.streak_freezes f
      where f.pair_id = public.current_pair_id()
        and f.month = date_trunc('month', current_date)::date
    ), '[]'::jsonb),
    'last_day',  (
      select max(f.day_index)
      from public.streak_freezes f
      where f.pair_id = public.current_pair_id()
    )
  )
$$;

grant execute on function public.freeze_status() to authenticated;


-- ----------------------------------------------------------------------------
-- The no-argument form the app calls
--
-- settle_open_days() already resolves the pairing itself, and the page-load settle
-- should not have to know a pair id to pass in. Same shape, so the two sit together
-- at the call site.
-- ----------------------------------------------------------------------------

create or replace function public.settle_freezes()
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.settle_freezes(public.current_pair_id()), 0)
$$;

grant execute on function public.settle_freezes() to authenticated;
