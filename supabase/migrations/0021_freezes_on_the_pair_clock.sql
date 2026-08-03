-- ============================================================================
-- Freezes counted on the pair's clock, not the server's
--
-- `freezes_left(p_pair_id, p_on default null)` fell back to `current_date`, which is
-- the SESSION's date — UTC on Supabase. `freeze_status()` called it with no date, and
-- computed its `used_days` month from `current_date` too.
--
-- So for a couple in Lagos, between 23:00 and midnight local on the 1st, the
-- dashboard read the previous month's allowance: "none left this month" on a day that
-- had a fresh two.
--
-- The tell that this was a real inconsistency rather than a rounding quibble:
-- settle_freezes already gets it right. It passes `v_zero + v_day`, which is
-- pair-local by construction. So the function that GRANTS freezes and the function
-- that REPORTS them disagreed for about an hour a month, and the granting one was
-- correct — meaning a freeze could be spent and then reported as still available, or
-- the reverse.
--
-- Fixed at the source rather than at the call site. `freezes_left` now derives its
-- own default from the pairing's timezone, so a caller that forgets to pass a date
-- gets the right answer instead of a subtly wrong one. That is the same reasoning as
-- 0020 consolidating "earned": a rule that depends on every caller remembering it is
-- a rule that will be broken by the next caller.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The pair's today, in one place
--
-- Extracted because three functions now need it and each deriving its own is exactly
-- how the drift above happened.
-- ----------------------------------------------------------------------------

create or replace function public.pair_today(p_pair_id uuid)
returns date
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select (now() at time zone p.time_zone)::date
  from public.pairs p
  where p.id = p_pair_id
$$;

comment on function public.pair_today(uuid) is
  'The calendar date it is for this couple. Everything dated in this app is dated on '
  'their clock, not the server''s — the question window, the letter policy, the freeze '
  'allowance and the occasion banner.';

grant execute on function public.pair_today(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- freezes_left, defaulting to the pair's date
-- ----------------------------------------------------------------------------

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
        -- coalesce onto the PAIR's today, never the session's.
        and f.month = date_trunc(
              'month',
              coalesce(p_on, public.pair_today(p_pair_id), current_date)
            )::date
    )
  )
$$;

grant execute on function public.freezes_left(uuid, date) to authenticated;


-- ----------------------------------------------------------------------------
-- freeze_status, with its own month fixed too
--
-- `used_days` had the same bare `current_date`. Rewritten in plpgsql so the pairing
-- and its date are resolved once rather than four times — the SQL version called
-- current_pair_id() three separate times, which is correct but says less.
-- ----------------------------------------------------------------------------

create or replace function public.freeze_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_pair  uuid := public.current_pair_id();
  v_today date;
begin
  if v_pair is null then
    return jsonb_build_object(
      'allowance', public.freeze_allowance(),
      'left',      public.freeze_allowance(),
      'used_days', '[]'::jsonb,
      'last_day',  null
    );
  end if;

  v_today := public.pair_today(v_pair);

  return jsonb_build_object(
    'allowance', public.freeze_allowance(),
    'left',      coalesce(public.freezes_left(v_pair, v_today), 0),
    'used_days', coalesce((
      select jsonb_agg(f.day_index order by f.day_index desc)
      from public.streak_freezes f
      where f.pair_id = v_pair
        and f.month = date_trunc('month', v_today)::date
    ), '[]'::jsonb),
    'last_day',  (
      select max(f.day_index)
      from public.streak_freezes f
      where f.pair_id = v_pair
    )
  );
end;
$$;

grant execute on function public.freeze_status() to authenticated;
