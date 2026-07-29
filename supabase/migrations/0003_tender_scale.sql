-- ============================================================================
-- Sync — tender rescale and streak milestones
--
-- Run after 0002_phase3_tender.sql.
--
-- Two changes: the denomination goes up ~666x, and keeping a streak now pays a
-- one-off bonus.
--
-- WHY THE RESCALE IS FREE
--
-- Tender is a closed currency with no external peg, so only the *ratio* of daily
-- earnings to menu prices carries meaning. Multiplying both changes nothing
-- economically — it is a redenomination, like the won or the rupiah. Which is
-- also why the ceiling rule survives untouched: it is defined as 10x the daily
-- cap, so a menu item still caps at ten perfect days at any scale. That rule was
-- always about reachability, never about the number 600.
--
-- WHERE "MILLIONAIRE" NOW SITS
--
--   1,000,000 by day 30 needs ~56% average sync WITH an unbroken streak,
--   or ~78% without one. The streak is worth about 22 points of sync.
--
-- That is the point of doing both together. A pure rescale would have made every
-- couple who opens the app daily a millionaire at roughly the same moment — random
-- guessing averages 33% — and a leaderboard where everyone arrives together
-- ranks nothing but join date. Now the list separates couples who read each other
-- well from couples who merely showed up, and separately rewards the ones who
-- kept it up.
--
-- Safe to run on an empty ledger, which is the only time a redenomination is
-- clean. Once real entries exist this would mean either rewriting history or
-- living with two scales in one ledger.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The new scale
-- ----------------------------------------------------------------------------

create or replace function public.tender_completion() returns int
language sql immutable as $$ select 10000 $$;

create or replace function public.tender_accuracy_max() returns int
language sql immutable as $$ select 30000 $$;

create or replace function public.tender_daily_cap() returns int
language sql immutable as $$ select 40000 $$;

/** Ceiling for a single menu item: ten perfect days, at whatever the scale is. */
create or replace function public.menu_price_ceiling() returns int
language sql immutable as $$ select public.tender_daily_cap() * 10 $$;

alter table public.menu_items drop constraint if exists menu_items_price_check;
alter table public.menu_items add constraint menu_items_price_check
  check (price between 1 and 400000);


-- ----------------------------------------------------------------------------
-- Streak milestones
-- ----------------------------------------------------------------------------

-- 'streak' joins the reasons a wallet can be credited.
alter table public.tender_entries drop constraint if exists tender_entries_reason_check;
alter table public.tender_entries add constraint tender_entries_reason_check
  check (reason in ('reveal', 'solo', 'purchase', 'refund', 'streak', 'adjustment'));

-- Which milestone this entry paid, e.g. 7 or 30.
alter table public.tender_entries add column if not exists milestone int;

-- Each milestone pays once per person per pairing, EVER — not once per streak.
--
-- Deliberate: re-earnable milestones would be farmable. Break at day 8, rebuild
-- to 7, collect again, repeat — four payouts of the 7-day bonus inside a month
-- instead of one. Awarding once means a couple who breaks their streak can still
-- reach the milestones above them, but cannot re-harvest the ones below.
create unique index if not exists tender_entries_one_per_milestone
  on public.tender_entries (pair_id, user_id, milestone)
  where reason = 'streak';

/**
 * The ladder. Bonuses are ~17% of a strong month, deliberately a minority — at
 * 60% the base score would stop mattering and the list would rank attendance.
 */
create or replace function public.streak_milestones()
returns table (days int, bonus int)
language sql
immutable
as $$
  select * from (values
    (7,   25000),
    (14,  50000),
    (30, 125000),
    (60, 300000)
  ) as t(days, bonus)
$$;

/**
 * The pair's current streak: consecutive completed questions, counting back from
 * the most recent.
 *
 * Mirrors streakFrom() in src/lib/sync/day.ts. The unit is a completed question,
 * not a calendar day, so the 30-hour grace window stays meaningful — answering at
 * 01:00 must not break a run.
 *
 * `gap = pos` holds exactly across the contiguous run from the newest reveal
 * downward: both grow by one per row until a gap appears, after which gap
 * outpaces pos and never catches up again.
 */
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
  walked as (
    select
      n.top - r.day_index                              as gap,
      row_number() over (order by r.day_index desc) - 1 as pos
    from public.reveals r
    cross join newest n
    where r.pair_id = p_pair_id
  )
  select coalesce((select count(*) from walked where gap = pos), 0)::int
$$;

/**
 * Credits both wallets for every milestone the current streak has reached and
 * not yet been paid for.
 *
 * Idempotent through the unique index, so calling it on every reveal is correct
 * and cheap. It also back-fills: a pair whose streak passed a milestone before
 * this migration existed gets it on their next reveal.
 */
create or replace function public.award_streak_milestones(p_pair_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_streak int := public.pair_streak(p_pair_id);
  v_mile   record;
  v_member record;
  v_paid   int := 0;
begin
  if v_streak < 1 then
    return 0;
  end if;

  for v_mile in select days, bonus from public.streak_milestones() where days <= v_streak loop
    for v_member in
      select user_id from public.pair_members
      where pair_id = p_pair_id and left_at is null
    loop
      insert into public.tender_entries
        (pair_id, user_id, amount, reason, milestone, detail)
      values (
        p_pair_id, v_member.user_id, v_mile.bonus, 'streak', v_mile.days,
        jsonb_build_object('streak_at_award', v_streak)
      )
      on conflict do nothing;

      if found then
        v_paid := v_paid + 1;
      end if;
    end loop;
  end loop;

  return v_paid;
end;
$$;


-- ----------------------------------------------------------------------------
-- Wire the bonus into the daily payout, and count it as earned
-- ----------------------------------------------------------------------------

create or replace function public.pay_out_reveal(p_pair_id uuid, p_day_index int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_score  int;
  v_amount int;
  v_member record;
begin
  select sync_score into v_score
  from public.reveals
  where pair_id = p_pair_id and day_index = p_day_index;

  if v_score is null then
    return;
  end if;

  v_amount := public.tender_payout_for_score(v_score);

  for v_member in
    select user_id from public.pair_members
    where pair_id = p_pair_id and left_at is null
  loop
    insert into public.tender_entries (pair_id, user_id, amount, reason, day_index, detail)
    values (
      p_pair_id, v_member.user_id, v_amount, 'reveal', p_day_index,
      jsonb_build_object(
        'sync_score', v_score,
        'completion', public.tender_completion(),
        'accuracy', v_amount - public.tender_completion()
      )
    )
    on conflict do nothing;
  end loop;

  -- Same transaction as the day's pay, so a streak can never be reached without
  -- its bonus following.
  perform public.award_streak_milestones(p_pair_id);
end;
$$;

/**
 * Lifetime credits. What the Rich List ranks on.
 *
 * Includes streak bonuses: they were earned by keeping the ritual, which is
 * exactly the behaviour the list should celebrate. Still excludes refunds — money
 * coming back from a declined request was never new.
 */
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
    and reason in ('reveal', 'solo', 'streak')
$$;

/** Next milestone and how far off it is, for a quiet nudge in the UI. */
create or replace function public.next_streak_milestone()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_pair_id uuid := public.current_pair_id();
  v_streak  int;
  v_mile    record;
begin
  if v_pair_id is null then
    return null;
  end if;

  v_streak := public.pair_streak(v_pair_id);

  select days, bonus into v_mile
  from public.streak_milestones()
  where days > v_streak
    -- Skip anything already paid, so a rebuilt streak isn't shown a bonus it
    -- can never collect again.
    and not exists (
      select 1 from public.tender_entries e
      where e.pair_id = v_pair_id
        and e.user_id = auth.uid()
        and e.reason = 'streak'
        and e.milestone = streak_milestones.days
    )
  order by days
  limit 1;

  if v_mile.days is null then
    return jsonb_build_object('streak', v_streak);
  end if;

  return jsonb_build_object(
    'streak', v_streak,
    'days', v_mile.days,
    'bonus', v_mile.bonus,
    'to_go', v_mile.days - v_streak
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- The price guard, at the new ceiling
-- ----------------------------------------------------------------------------

create or replace function public.upsert_menu_item(
  p_item_id uuid,
  p_title   text,
  p_price   int
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid := public.current_pair_id();
  v_ceiling int := public.menu_price_ceiling();
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;

  p_title := btrim(coalesce(p_title, ''));
  if char_length(p_title) < 2 then
    raise exception 'Give it a name.' using errcode = '22023';
  end if;
  if p_price is null or p_price < 1 or p_price > v_ceiling then
    raise exception 'Price must be between T1 and T%.', v_ceiling using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.menu_items (pair_id, owner_id, title, price)
    values (v_pair_id, v_user, p_title, p_price)
    returning id into v_id;
    return v_id;
  end if;

  update public.menu_items
  set title = p_title, price = p_price
  where id = p_item_id and owner_id = v_user and pair_id = v_pair_id
  returning id into v_id;

  if v_id is null then
    raise exception 'That is not your item to change.' using errcode = '42501';
  end if;

  return v_id;
end;
$$;

grant execute on function public.menu_price_ceiling()            to authenticated;
grant execute on function public.streak_milestones()             to authenticated;
grant execute on function public.pair_streak(uuid)               to authenticated;
grant execute on function public.next_streak_milestone()         to authenticated;
