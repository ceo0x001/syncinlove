-- ============================================================================
-- Marking the moment somebody becomes a Tender Millionaire
--
-- The economy has paid out since Phase 3 and never once said "look what you have
-- built". A streak gets milestones; the tender itself got nothing.
--
-- THE LADDER, AND WHY IT STOPS WHERE IT DOES
--
-- A perfect day pays 40,000 and a realistic one about 30,000, so:
--
--   1,000,000     about a month of showing up
--   5,000,000     about five and a half months
--   10,000,000    about a year
--   25,000,000    a bit over two years
--
-- It stops there deliberately. A billion is roughly ninety years of unbroken daily
-- play and a trillion is ninety thousand — tiers no human reaches are code that never
-- runs, and an aspiration nobody can attain is a promise the app cannot keep. Better
-- a short ladder every rung of which somebody will actually stand on.
--
-- EARNED, NEVER HELD
--
-- Counted from tender_earning_reasons() — the same predicate the Rich List ranks on,
-- already the single source of truth after 0020 found four copies of it and two had
-- drifted. Reading the BALANCE instead would mean spending tender on your partner
-- demoted you, and the entire point of this economy is that it gets spent on them.
-- A milestone that rewards hoarding would be pointed the wrong way.
--
-- CEREMONIAL, NEVER PAID
--
-- Recorded in its own table rather than as a tender_entries row. A tender milestone
-- that pays tender is circular — reaching a million funds the next million — and it
-- would inflate the Rich List it is meant to decorate. The streak milestones pay
-- because they reward a habit; this one only notices a total.
--
-- BOTH, AND TOGETHER
--
-- Per person, and once per couple on their combined total. Both partners are paid
-- identically for every reveal and every streak bonus — the only divergence is a
-- 'solo' day — so they cross each rung within a day or two of each other. The couple
-- row is not a second achievement so much as the honest way to name a shared one, and
-- it arrives first: their joint million lands at about seventeen days, roughly half
-- way to either of their own.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The ladder
--
-- A function rather than a table, matching streak_milestones(): the thresholds are a
-- rule, not data, and nothing should be able to edit them through the API.
-- ----------------------------------------------------------------------------

create or replace function public.tender_milestones()
returns table (threshold bigint, label text)
language sql
immutable
as $$
  values
    (1000000::bigint,  'Millionaire'),
    (5000000::bigint,  'Five million'),
    (10000000::bigint, 'Ten million'),
    (25000000::bigint, 'Twenty-five million')
$$;

grant execute on function public.tender_milestones() to authenticated;


-- ----------------------------------------------------------------------------
-- What has been reached, and when
--
-- user_id null means the couple's combined total, which is why the two unique indexes
-- are partial: a null never equals a null, so one plain unique constraint would let
-- the same couple row be inserted repeatedly.
-- ----------------------------------------------------------------------------

create table if not exists public.tender_marks (
  id         uuid primary key default gen_random_uuid(),
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  -- Null for the couple's joint total.
  user_id    uuid references public.profiles (id) on delete cascade,
  threshold  bigint not null check (threshold > 0),
  reached_at timestamptz not null default now()
);

create unique index if not exists tender_marks_person_once
  on public.tender_marks (pair_id, user_id, threshold) where user_id is not null;

create unique index if not exists tender_marks_pair_once
  on public.tender_marks (pair_id, threshold) where user_id is null;

alter table public.tender_marks enable row level security;

drop policy if exists tender_marks_select on public.tender_marks;
create policy tender_marks_select on public.tender_marks for select
  using (public.is_pair_member(pair_id));

-- Readable by the pair, writable by nobody: the only way a row appears is the award
-- function below, which is security definer.
grant select on public.tender_marks to authenticated;


-- ----------------------------------------------------------------------------
-- Awarding
--
-- Called from pay_out_reveal, in the same transaction as the money that caused it, so
-- a total can never exist without the mark that recognises it.
--
-- `on conflict do nothing` against the partial indexes makes this idempotent: run it
-- twice on the same day and the second run awards nothing.
-- ----------------------------------------------------------------------------

create or replace function public.award_tender_marks(p_pair_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member  record;
  v_mile    record;
  v_earned  bigint;
  v_joint   bigint;
  v_new     int := 0;
begin
  select coalesce(sum(amount), 0)::bigint into v_joint
  from public.tender_entries
  where pair_id = p_pair_id
    and reason = any (public.tender_earning_reasons());

  for v_mile in select threshold from public.tender_milestones() loop
    if v_joint >= v_mile.threshold then
      insert into public.tender_marks (pair_id, user_id, threshold)
      values (p_pair_id, null, v_mile.threshold)
      on conflict do nothing;
      if found then v_new := v_new + 1; end if;
    end if;
  end loop;

  for v_member in
    select user_id from public.pair_members
    where pair_id = p_pair_id and left_at is null
  loop
    select coalesce(sum(amount), 0)::bigint into v_earned
    from public.tender_entries
    where pair_id = p_pair_id
      and user_id = v_member.user_id
      and reason = any (public.tender_earning_reasons());

    for v_mile in select threshold from public.tender_milestones() loop
      if v_earned >= v_mile.threshold then
        insert into public.tender_marks (pair_id, user_id, threshold)
        values (p_pair_id, v_member.user_id, v_mile.threshold)
        on conflict do nothing;
        if found then v_new := v_new + 1; end if;
      end if;
    end loop;
  end loop;

  return v_new;
end;
$$;

revoke all on function public.award_tender_marks(uuid) from public;
revoke all on function public.award_tender_marks(uuid) from anon;
revoke all on function public.award_tender_marks(uuid) from authenticated;


-- ----------------------------------------------------------------------------
-- What to show
--
-- Highest rung reached by this person and by the couple, plus how far to the next —
-- so the wallet can say "a third of the way to five million" rather than only ever
-- congratulating.
-- ----------------------------------------------------------------------------

create or replace function public.tender_standing()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_pair   uuid := public.current_pair_id();
  v_user   uuid := auth.uid();
  v_earned bigint;
  v_joint  bigint;
  v_mine   record;
  v_ours   record;
  v_next   record;
begin
  if v_pair is null or v_user is null then
    return jsonb_build_object('mine', null, 'ours', null, 'next', null);
  end if;

  select coalesce(sum(amount), 0)::bigint into v_earned
  from public.tender_entries
  where pair_id = v_pair and user_id = v_user
    and reason = any (public.tender_earning_reasons());

  select coalesce(sum(amount), 0)::bigint into v_joint
  from public.tender_entries
  where pair_id = v_pair
    and reason = any (public.tender_earning_reasons());

  select m.threshold, ml.label, m.reached_at into v_mine
  from public.tender_marks m
  join public.tender_milestones() ml on ml.threshold = m.threshold
  where m.pair_id = v_pair and m.user_id = v_user
  order by m.threshold desc limit 1;

  select m.threshold, ml.label, m.reached_at into v_ours
  from public.tender_marks m
  join public.tender_milestones() ml on ml.threshold = m.threshold
  where m.pair_id = v_pair and m.user_id is null
  order by m.threshold desc limit 1;

  select threshold, label into v_next
  from public.tender_milestones()
  where threshold > v_earned
  order by threshold limit 1;

  return jsonb_build_object(
    'earned', v_earned,
    'joint',  v_joint,
    'mine', case when v_mine.threshold is null then null else jsonb_build_object(
      'threshold', v_mine.threshold, 'label', v_mine.label, 'reached_at', v_mine.reached_at
    ) end,
    'ours', case when v_ours.threshold is null then null else jsonb_build_object(
      'threshold', v_ours.threshold, 'label', v_ours.label, 'reached_at', v_ours.reached_at
    ) end,
    'next', case when v_next.threshold is null then null else jsonb_build_object(
      'threshold', v_next.threshold, 'label', v_next.label
    ) end
  );
end;
$$;

revoke all on function public.tender_standing() from public;
revoke all on function public.tender_standing() from anon;
grant execute on function public.tender_standing() to authenticated;


-- ----------------------------------------------------------------------------
-- pay_out_reveal, now noticing the total as well as the streak
--
-- 0003's body verbatim with one added call. Copied rather than rewritten, per the rule
-- 0023 arrived at the hard way.
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

  -- Same transaction as the money, so a total can never exist without the mark that
  -- recognises it. Ceremonial only — see 0029 for why this cannot pay.
  perform public.award_tender_marks(p_pair_id);
end;
$$;

-- Closed properly in 0030, along with seven other helpers found the same way.
revoke all on function public.pay_out_reveal(uuid, int) from anon, authenticated, public;
