-- ============================================================================
-- Phase 11: tender milestones, and the privileges found alongside them
--
-- THE ASSERTION THIS SUITE EXISTS FOR
--
-- A milestone is recorded once, from what somebody EARNED, and it never pays.
--
-- Earned rather than held, because spending tender on your partner is the point of the
-- economy and a milestone read off the balance would demote you for doing it. Never
-- paying, because a tender milestone that pays tender funds the next one and inflates
-- the Rich List it is meant to decorate.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

begin;

create or replace function assert(p_ok boolean, p_what text)
returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'FAILED: %', p_what; end if;
  raise notice 'ok — %', p_what;
end $$;

\set ada 'a0b00000-0000-0000-0000-0000000000ab'
\set bo  'b0b00000-0000-0000-0000-0000000000bb'
\set pair 'ab000000-0000-0000-0000-0000000000ab'

insert into auth.users (id, email, is_anonymous) values
  (:'ada', 'ada11@example.com', false),
  (:'bo',  'bo11@example.com',  false);
insert into public.profiles (id, first_name) values (:'ada', 'Ada'), (:'bo', 'Bo');

insert into public.pairs (id, time_zone, day_zero, status)
values (:'pair', 'UTC', (now() at time zone 'UTC')::date - 40, 'active');
insert into public.pair_members (pair_id, user_id, role) values
  (:'pair', :'ada', 'inviter'), (:'pair', :'bo', 'invitee');


-- ---------------------------------------------------------------------------
-- The ladder stops where people reach
-- ---------------------------------------------------------------------------

select assert(
  (select max(threshold) from public.tender_milestones()) = 25000000,
  'the ladder tops out at twenty-five million — about two years of daily play'
);

/*
  No unreachable rungs.

  A perfect day pays tender_daily_cap(), so the top rung divided by that is the fewest
  days anybody could reach it in. Ten years of flawless play is the limit of what counts
  as an aspiration rather than a decoration; a billion would be ninety years and a
  trillion ninety thousand.
*/
select assert(
  (select max(threshold) from public.tender_milestones()) / public.tender_daily_cap() < 3650,
  'and every rung is reachable inside a decade of perfect days'
);


-- ---------------------------------------------------------------------------
-- Earned, not held
-- ---------------------------------------------------------------------------

insert into public.tender_entries (pair_id, user_id, amount, reason, day_index)
values (:'pair', :'ada', 1200000, 'reveal', 1);

select assert(public.award_tender_marks(:'pair') > 0, 'crossing a rung records it');

select assert(
  (select count(*) from public.tender_marks
    where pair_id = :'pair' and user_id = :'ada' and threshold = 1000000) = 1,
  'Ada is a millionaire'
);

select assert(
  (select count(*) from public.tender_marks
    where pair_id = :'pair' and user_id is null and threshold = 1000000) = 1,
  'and so, jointly, are the two of them'
);

-- Idempotent: the award runs on every reveal, for the rest of the pairing's life.
select assert(public.award_tender_marks(:'pair') = 0, 'running it again records nothing');

select assert(
  (select count(*) from public.tender_marks where pair_id = :'pair') = 2,
  'and no duplicate rows appear'
);

/*
  Spending must not take it away.

  This is the assertion the whole design turns on. A purchase debits the wallet without
  touching what was earned, so a millionaire who spends everything on their partner is
  still a millionaire — which is the behaviour the economy needs, since spending it on
  them is the entire point.
*/
insert into public.tender_entries (pair_id, user_id, amount, reason)
values (:'pair', :'ada', -1200000, 'purchase');

select assert(public.tender_balance(:'ada') = 0, 'Ada has spent all of it');

select assert(
  (select count(*) from public.tender_marks
    where pair_id = :'pair' and user_id = :'ada' and threshold = 1000000) = 1,
  'and is still a millionaire — spending on your partner cannot demote you'
);

select assert(public.award_tender_marks(:'pair') = 0, 'and no rung is re-awarded after spending');


-- ---------------------------------------------------------------------------
-- It never pays
-- ---------------------------------------------------------------------------

select (select coalesce(sum(amount), 0) from public.tender_entries
         where pair_id = :'pair') as before_award \gset

insert into public.tender_entries (pair_id, user_id, amount, reason, day_index)
values (:'pair', :'ada', 4000000, 'reveal', 2);

select public.award_tender_marks(:'pair');

select assert(
  (select coalesce(sum(amount), 0) from public.tender_entries
    where pair_id = :'pair' and reason not in ('reveal', 'purchase')) = 0,
  'reaching a milestone credits nobody — it would fund the next one and inflate the list'
);

select assert(
  (select count(*) from public.tender_marks
    where pair_id = :'pair' and user_id = :'ada' and threshold = 5000000) = 1,
  'while still recording the rung that was reached'
);


-- ---------------------------------------------------------------------------
-- What the app reads
-- ---------------------------------------------------------------------------

set sync.uid = 'a0b00000-0000-0000-0000-0000000000ab';
set role authenticated;

select public.tender_standing() as standing \gset

select assert(
  (:'standing'::jsonb -> 'mine' ->> 'label') = 'Five million',
  'standing reports the highest rung reached, not the first'
);

select assert(
  (:'standing'::jsonb -> 'next' ->> 'threshold')::bigint = 10000000,
  'and what is next, so a wallet can show progress rather than only congratulate'
);

select assert(
  (:'standing'::jsonb ->> 'earned')::bigint = 5200000,
  'counted from earned, which spending did not reduce'
);

-- Bo has earned nothing, so he has no rung — the marks are per person, not per pairing.
select assert(
  (select count(*) from public.tender_marks
    where pair_id = :'pair' and user_id = :'bo') = 0,
  'a partner who has earned nothing has no rung of their own'
);

reset role;


-- ---------------------------------------------------------------------------
-- Dating a milestone from when it actually happened
--
-- NOTE ON EVERY DATE COMPARISON BELOW: both sides are pinned to UTC.
--
-- `reached_at::date` casts in the SESSION's timezone. The first version of this block
-- compared that against a UTC date and passed in Lagos and Kiritimati while failing in
-- Los Angeles, because a session seven hours behind UTC is on the previous calendar day
-- for seven hours out of every twenty-four.
--
-- That is the fifth time tonight this exact mistake has appeared in this repo, and the
-- first time I made it myself — in the suite written to catch date bugs. `at time zone
-- 'UTC'` on both sides is what makes the comparison mean one thing.
--
-- award_tender_marks runs on a reveal, so a couple already past a rung when this shipped
-- would have had it stamped with their NEXT reveal. There was such a couple. A milestone
-- whose date is wrong about when it was reached is worse than none — it is the thing you
-- would screenshot.
-- ---------------------------------------------------------------------------

savepoint before_backfill;

delete from public.tender_marks where pair_id = :'pair';
delete from public.tender_entries where pair_id = :'pair';

-- Three credits on three different days. The second is the one that crosses a million.
insert into public.tender_entries (pair_id, user_id, amount, reason, day_index, created_at)
values
  (:'pair', :'ada', 600000, 'reveal', 1, now() - interval '10 days'),
  (:'pair', :'ada', 600000, 'reveal', 2, now() - interval '6 days'),
  (:'pair', :'ada', 600000, 'reveal', 3, now() - interval '2 days');

-- What award_tender_marks does on its own: correct rung, today's date.
select public.award_tender_marks(:'pair');

select assert(
  (select (reached_at at time zone 'UTC')::date from public.tender_marks
    where pair_id = :'pair' and user_id = :'ada' and threshold = 1000000)
    = (now() at time zone 'UTC')::date,
  'awarding on a reveal dates the mark today, which is wrong for a rung already passed'
);

-- The backfill, verbatim from 0031.
with earned as (
  select te.pair_id, te.user_id, te.created_at,
         sum(te.amount) over (partition by te.pair_id, te.user_id
                              order by te.created_at, te.id) as running
  from public.tender_entries te
  where te.reason = any (public.tender_earning_reasons())
),
crossings as (
  select e.pair_id, e.user_id, m.threshold, min(e.created_at) as reached_at
  from earned e cross join public.tender_milestones() m
  where e.running >= m.threshold
  group by e.pair_id, e.user_id, m.threshold
)
insert into public.tender_marks (pair_id, user_id, threshold, reached_at)
select pair_id, user_id, threshold, reached_at from crossings
on conflict (pair_id, user_id, threshold) where user_id is not null
do update set reached_at = excluded.reached_at;

select assert(
  (select (reached_at at time zone 'UTC')::date from public.tender_marks
    where pair_id = :'pair' and user_id = :'ada' and threshold = 1000000)
    = ((now() - interval '6 days') at time zone 'UTC')::date,
  'the backfill moves it to the day the ledger says they crossed'
);

select assert(
  (select count(*) from public.tender_marks
    where pair_id = :'pair' and user_id = :'ada') = 1,
  'and corrects rather than duplicating — one row, not two'
);

-- Re-running it is a no-op, which is what makes it safe to paste twice.
with earned as (
  select te.pair_id, te.user_id, te.created_at,
         sum(te.amount) over (partition by te.pair_id, te.user_id
                              order by te.created_at, te.id) as running
  from public.tender_entries te
  where te.reason = any (public.tender_earning_reasons())
),
crossings as (
  select e.pair_id, e.user_id, m.threshold, min(e.created_at) as reached_at
  from earned e cross join public.tender_milestones() m
  where e.running >= m.threshold
  group by e.pair_id, e.user_id, m.threshold
)
insert into public.tender_marks (pair_id, user_id, threshold, reached_at)
select pair_id, user_id, threshold, reached_at from crossings
on conflict (pair_id, user_id, threshold) where user_id is not null
do update set reached_at = excluded.reached_at;

select assert(
  (select count(*) from public.tender_marks
    where pair_id = :'pair' and user_id = :'ada') = 1
  and (select (reached_at at time zone 'UTC')::date from public.tender_marks
        where pair_id = :'pair' and user_id = :'ada' and threshold = 1000000)
      = ((now() - interval '6 days') at time zone 'UTC')::date,
  'and running it twice changes nothing'
);

/*
  Spending cannot move the date either.

  A debit after the crossing must not shift it, because the running sum is over EARNED
  entries only. If a purchase were included the total would dip back under the threshold
  and the crossing would appear to happen later — or twice.
*/
insert into public.tender_entries (pair_id, user_id, amount, reason, created_at)
values (:'pair', :'ada', -1700000, 'purchase', now() - interval '5 days');

with earned as (
  select te.pair_id, te.user_id, te.created_at,
         sum(te.amount) over (partition by te.pair_id, te.user_id
                              order by te.created_at, te.id) as running
  from public.tender_entries te
  where te.reason = any (public.tender_earning_reasons())
),
crossings as (
  select e.pair_id, e.user_id, m.threshold, min(e.created_at) as reached_at
  from earned e cross join public.tender_milestones() m
  where e.running >= m.threshold
  group by e.pair_id, e.user_id, m.threshold
)
insert into public.tender_marks (pair_id, user_id, threshold, reached_at)
select pair_id, user_id, threshold, reached_at from crossings
on conflict (pair_id, user_id, threshold) where user_id is not null
do update set reached_at = excluded.reached_at;

select assert(
  (select (reached_at at time zone 'UTC')::date from public.tender_marks
    where pair_id = :'pair' and user_id = :'ada' and threshold = 1000000)
    = ((now() - interval '6 days') at time zone 'UTC')::date,
  'a purchase afterwards does not move the date, because the sum is over earned only'
);

rollback to savepoint before_backfill;


-- ---------------------------------------------------------------------------
-- Which rungs a particular day carries
--
-- The wallet shows where a couple stands; this marks the reveal where it happened. Read
-- per day rather than from tender_standing(), which returns only the HIGHEST rung — once
-- a couple passes five million, standing stops mentioning the million, and the reveal
-- where they crossed it would quietly lose its marker.
-- ---------------------------------------------------------------------------

savepoint before_day_marks;

delete from public.tender_marks where pair_id = :'pair';

-- Ada crossed a million on the pair's day 3, and the couple on day 1.
insert into public.tender_marks (pair_id, user_id, threshold, reached_at)
select :'pair', :'ada', 1000000,
       ((p.day_zero + 3)::timestamp + interval '14 hours') at time zone p.time_zone
from public.pairs p where p.id = :'pair';

insert into public.tender_marks (pair_id, user_id, threshold, reached_at)
select :'pair', null, 1000000,
       ((p.day_zero + 1)::timestamp + interval '9 hours') at time zone p.time_zone
from public.pairs p where p.id = :'pair';

set sync.uid = 'a0b00000-0000-0000-0000-0000000000ab';
set role authenticated;

select assert(
  (select count(*) from public.marks_reached_on_day(3)) = 1
  and (select joint from public.marks_reached_on_day(3)) is false,
  'day 3 carries Ada''s own rung and nothing else'
);

select assert(
  (select count(*) from public.marks_reached_on_day(1)) = 1
  and (select joint from public.marks_reached_on_day(1)) is true,
  'day 1 carries the couple''s'
);

select assert(
  (select count(*) from public.marks_reached_on_day(2)) = 0,
  'and a day nothing happened on carries nothing'
);

/*
  The reason this lives in SQL at all.

  reached_at is a timestamptz. Deciding "the same day" in the app would use whatever zone
  the server runs in, so a couple whose milestone landed at 00:30 their time would have it
  filed against the previous day for anyone rendering from UTC. Moving the pairing 14
  hours east must not move which day the mark belongs to.
*/
reset role;
update public.pairs set time_zone = 'Pacific/Kiritimati' where id = :'pair';
set sync.uid = 'a0b00000-0000-0000-0000-0000000000ab';
set role authenticated;

/*
  It MOVES, and that is the proof.

  I first asserted the day stayed at 3 when the pairing moved east, which is the opposite
  of what pair-local means and failed in all four session timezones — correctly. The mark
  is a fixed instant: 14:00 UTC on day 3. Read on a UTC+14 clock that same instant is
  04:00 the following morning, so it belongs to day 4 now. A function reading the server's
  zone would have kept it on day 3 and passed my wrong assertion.
*/
select assert(
  (select count(*) from public.marks_reached_on_day(3)) = 0
  and (select count(*) from public.marks_reached_on_day(4)) = 1,
  'the day is decided on the pairing''s clock — move them east and the mark moves with them'
);

reset role;
update public.pairs set time_zone = 'UTC' where id = :'pair';

-- A partner's own rung is theirs to be told about, not something to congratulate
-- somebody else for on their reveal.
insert into public.tender_marks (pair_id, user_id, threshold, reached_at)
select :'pair', :'bo', 1000000,
       ((p.day_zero + 3)::timestamp + interval '14 hours') at time zone p.time_zone
from public.pairs p where p.id = :'pair';

set sync.uid = 'a0b00000-0000-0000-0000-0000000000ab';
set role authenticated;

select assert(
  (select count(*) from public.marks_reached_on_day(3)) = 1,
  'a partner''s personal rung does not appear on your reveal'
);

reset role;

select assert(
  has_function_privilege('anon', 'public.marks_reached_on_day(int)', 'execute') is false,
  'and the day''s marks are not readable anonymously'
);

rollback to savepoint before_day_marks;


-- ---------------------------------------------------------------------------
-- Privileges
--
-- The eight helpers that answered the anon key before 0030. Asserted here because a
-- note about this mistake already existed in the repo and did not prevent eight more
-- instances of it — an assertion does.
-- ---------------------------------------------------------------------------

select assert(
  has_function_privilege('anon', 'public.award_tender_marks(uuid)', 'execute') is false
  and has_function_privilege('authenticated', 'public.award_tender_marks(uuid)', 'execute') is false,
  'awarding is reachable only from inside the database'
);

select assert(
  has_function_privilege('anon', 'public.tender_standing()', 'execute') is false,
  'and standing is not readable anonymously'
);

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.pay_out_reveal(uuid, int)',
    'public.award_streak_milestones(uuid)',
    'public.settle_freezes(uuid)',
    'public.pair_streak(uuid)',
    'public.pair_today(uuid)',
    'public.freezes_left(uuid, date)',
    'public.tender_balance(uuid)',
    'public.tender_earned(uuid)'
  ] loop
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'FAILED: anon can still execute %', fn;
    end if;
  end loop;
  raise notice 'ok — none of the eight internal helpers answers the anon key';
end $$;

do $$
declare
  fn text;
begin
  -- The three that write. Nothing outside the database has any business calling these.
  foreach fn in array array[
    'public.pay_out_reveal(uuid, int)',
    'public.award_streak_milestones(uuid)',
    'public.settle_freezes(uuid)'
  ] loop
    if has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'FAILED: a signed-in user can still execute %', fn;
    end if;
  end loop;
  raise notice 'ok — and the three that write the ledger are internal-only';
end $$;

-- Deliberately still granted, and restated in 0030 so a revoke could not take them out
-- from under the dashboard.
select assert(
  has_function_privilege('authenticated', 'public.tender_balance(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.tender_earned(uuid)', 'execute'),
  'while the readers the app genuinely uses still work for a signed-in person'
);


-- ---------------------------------------------------------------------------
-- Leakage
-- ---------------------------------------------------------------------------

set sync.uid = 'a0b00000-0000-0000-0000-0000000000ab';
set role authenticated;

do $$
begin
  insert into public.tender_marks (pair_id, threshold)
  values ('ab000000-0000-0000-0000-0000000000ab', 1000000);
  raise exception 'FAILED: a user awarded themselves a milestone';
exception when insufficient_privilege then
  raise notice 'ok — there is no API path to award yourself a rung';
end $$;

/*
  Four, not three, and getting that wrong is instructive.

  Ada's 1M and 5M, plus the couple's 1M and 5M — the joint total is the sum of BOTH
  partners' earnings, so it crosses every rung Ada does and crosses it first. I wrote 3
  here on the assumption the joint row tracked something separate. It does not: it tracks
  more.
*/
select assert(
  (select count(*) from public.tender_marks) = 4,
  'a member reads their own pairing''s marks, so the app can show them'
);

reset role;

rollback;
