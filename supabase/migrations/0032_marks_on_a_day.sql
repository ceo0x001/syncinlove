-- ============================================================================
-- Which rungs were crossed on a given day
--
-- The wallet shows where a couple stands. This is the other half: marking the reveal
-- where it actually happened, so the day they became Tender Millionaires is a thing
-- their history says rather than a number that quietly went up.
--
-- WHY THIS IS A FUNCTION AND NOT A FILTER IN TYPESCRIPT
--
-- "The same day" means the same day on the PAIR's clock. reached_at is a timestamptz;
-- comparing it to a calendar date in JavaScript would use whatever zone the server
-- happens to run in, and a couple in Lagos crossing at 00:30 local would have their
-- millionaire moment filed against the previous day for anyone rendering from UTC.
--
-- That exact mistake has appeared five times in this repo in one night — three fixtures
-- dated off current_date, a freeze allowance, and once in the suite written to catch date
-- bugs. The pattern is always a session clock next to a pair clock. So the comparison
-- happens here, where the pairing's timezone is known, and TypeScript is handed rows
-- rather than a decision.
--
-- WHY NOT tender_standing()
--
-- That returns the HIGHEST rung, which is what a wallet wants and exactly wrong for a
-- history. Once a couple passes five million, standing stops mentioning the million —
-- and the reveal where they crossed it would silently lose its marker. A day's marks
-- have to be read per day.
-- ============================================================================

create or replace function public.marks_reached_on_day(p_day_index int)
returns table (threshold bigint, label text, joint boolean, reached_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_pair uuid := public.current_pair_id();
  v_user uuid := auth.uid();
  v_tz   text;
  v_zero date;
begin
  if v_pair is null or v_user is null then
    return;
  end if;

  select p.time_zone, p.day_zero into v_tz, v_zero
  from public.pairs p where p.id = v_pair;

  if v_tz is null then
    return;
  end if;

  return query
  select m.threshold, ml.label, (m.user_id is null) as joint, m.reached_at
  from public.tender_marks m
  join public.tender_milestones() ml on ml.threshold = m.threshold
  where m.pair_id = v_pair
    -- Mine or the couple's. A partner's personal rung is theirs to be told about, not
    -- something to congratulate somebody else for on their own reveal.
    and (m.user_id = v_user or m.user_id is null)
    -- day_zero + day_index IS that day's calendar date for this pairing, so the
    -- comparison is pair-local on both sides without needing to name a zone twice.
    and (m.reached_at at time zone v_tz)::date = v_zero + p_day_index
  order by m.threshold desc;
end;
$$;

comment on function public.marks_reached_on_day(int) is
  'Rungs this person, or the couple, crossed on one particular day — compared on the '
  'pairing''s own clock, because a timestamptz read in the server''s zone files a '
  'Lagos couple''s midnight milestone against the wrong day.';

revoke all on function public.marks_reached_on_day(int) from public;
revoke all on function public.marks_reached_on_day(int) from anon;
grant execute on function public.marks_reached_on_day(int) to authenticated;
