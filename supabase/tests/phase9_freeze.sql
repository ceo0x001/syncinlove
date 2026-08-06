-- ============================================================================
-- Phase 9: freeze days
--
-- THE ASSERTION THIS SUITE EXISTS FOR
--
-- A forgiven day bridges the run and adds nothing to its length.
--
-- Everything else here is detail. That one rule is what keeps the tender economy
-- intact without needing a carefully chosen allowance: the 60-day milestone still
-- requires 60 real reveals, so no allowance however generous turns freezes into
-- free money. If a frozen day ever starts counting, the milestone payouts become
-- purchasable with absence and the Rich List starts ranking patience.
--
-- Several assertions here are deliberate duplicates of streakFrom's unit tests.
-- The streak is computed twice — SQL pays the tender, TypeScript draws the number —
-- and the failure mode of them drifting apart is a couple told they are on day 12
-- while being paid for day 4.
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

\set ada 'a9000000-0000-0000-0000-0000000000a9'
\set bo  'b9000000-0000-0000-0000-0000000000b9'
\set pair '99990000-0000-0000-0000-000000000999'

insert into auth.users (id, email, is_anonymous) values
  (:'ada', 'ada9@example.com', false),
  (:'bo',  'bo9@example.com',  false);
insert into public.profiles (id, first_name) values (:'ada', 'Ada'), (:'bo', 'Bo');

-- day_zero 40 days back so day indexes and calendar dates both have room.
insert into public.pairs (id, time_zone, day_zero, status)
values (:'pair', 'UTC', current_date - 40, 'active');
insert into public.pair_members (pair_id, user_id, role) values
  (:'pair', :'ada', 'inviter'), (:'pair', :'bo', 'invitee');

-- Reveals on days 0,1,2 and 4. Day 3 is the hole.
insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
select :'pair', d, (select id from public.questions limit 1), 80, '{}'::jsonb
from unnest(array[0, 1, 2, 4]) as d;


-- ---------------------------------------------------------------------------
-- Without a freeze, the gap ends the run
-- ---------------------------------------------------------------------------

select assert(
  public.pair_streak(:'pair') = 1,
  'an unforgiven gap ends the run at the newest day'
);


-- ---------------------------------------------------------------------------
-- With one, it bridges — and adds nothing
-- ---------------------------------------------------------------------------

insert into public.streak_freezes (pair_id, day_index, month)
values (:'pair', 3, date_trunc('month', current_date)::date);

select assert(
  public.pair_streak(:'pair') = 4,
  'a forgiven gap bridges the run: four answered days stay one run'
);

select assert(
  public.pair_streak(:'pair') <> 5,
  'AND THE FROZEN DAY DOES NOT COUNT — 60 milestones still need 60 real reveals'
);


-- ---------------------------------------------------------------------------
-- Two holes, one freeze
-- ---------------------------------------------------------------------------

insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
values (:'pair', 7, (select id from public.questions limit 1), 80, '{}'::jsonb);

-- Days 5 and 6 are now both missing, neither forgiven.
select assert(
  public.pair_streak(:'pair') = 1,
  'a gap wider than the freezes covering it still ends the run'
);

insert into public.streak_freezes (pair_id, day_index, month)
values (:'pair', 6, date_trunc('month', current_date)::date);

select assert(
  public.pair_streak(:'pair') = 1,
  'and forgiving only one of two adjacent missed days does not bridge it'
);

insert into public.streak_freezes (pair_id, day_index, month)
values (:'pair', 5, date_trunc('month', current_date)::date);

select assert(
  public.pair_streak(:'pair') = 5,
  'forgiving both bridges it, and still counts only the five answered days'
);


-- ---------------------------------------------------------------------------
-- Freezes that should change nothing
-- ---------------------------------------------------------------------------

insert into public.streak_freezes (pair_id, day_index, month)
values (:'pair', 9, date_trunc('month', current_date)::date);

select assert(
  public.pair_streak(:'pair') = 5,
  'a freeze above the newest answered day cannot extend a run past its last answer'
);

delete from public.streak_freezes where pair_id = :'pair' and day_index = 9;

insert into public.streak_freezes (pair_id, day_index, month)
values (:'pair', 2, date_trunc('month', current_date)::date);

select assert(
  public.pair_streak(:'pair') = 5,
  'and a freeze on a day that was answered anyway changes nothing'
);

delete from public.streak_freezes where pair_id = :'pair' and day_index = 2;


-- ---------------------------------------------------------------------------
-- The allowance
-- ---------------------------------------------------------------------------

select assert(public.freeze_allowance() = 2, 'the allowance is two a month');

-- Three already used this month (days 3, 5, 6), so it is spent.
select assert(
  public.freezes_left(:'pair') = 0,
  'freezes_left never goes negative when more exist than the allowance'
);

delete from public.streak_freezes where pair_id = :'pair' and day_index in (5, 6);
select assert(
  public.freezes_left(:'pair') = 1,
  'and reports what is left of the month'
);

-- Last month's spending must not eat this month's allowance.
insert into public.streak_freezes (pair_id, day_index, month)
values (:'pair', 20, (date_trunc('month', current_date) - interval '1 month')::date),
       (:'pair', 21, (date_trunc('month', current_date) - interval '1 month')::date);

select assert(
  public.freezes_left(:'pair') = 1,
  'a previous month''s freezes do not count against this month'
);

delete from public.streak_freezes where pair_id = :'pair' and day_index in (20, 21);


-- ---------------------------------------------------------------------------
-- settle_freezes: what it grants, and what it refuses to
-- ---------------------------------------------------------------------------

delete from public.streak_freezes where pair_id = :'pair';
delete from public.reveals where pair_id = :'pair';

-- Answered day 0, then day 1 missed and closed, then answered day 2.
insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
select :'pair', d, (select id from public.questions limit 1), 80, '{}'::jsonb
from unnest(array[0, 2]) as d;

select assert(public.settle_freezes(:'pair') = 1, 'settle forgives the one closed gap');
select assert(
  exists (select 1 from public.streak_freezes where pair_id = :'pair' and day_index = 1),
  'and forgives the right day'
);
select assert(public.pair_streak(:'pair') = 2, 'so the run holds at two answered days');

select assert(public.settle_freezes(:'pair') = 0, 'running it again grants nothing — idempotent');

-- It must not reach a day that is still answerable.
delete from public.streak_freezes where pair_id = :'pair';
delete from public.reveals where pair_id = :'pair';
insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
values (:'pair', public.pair_day_index(:'pair'), (select id from public.questions limit 1), 80, '{}'::jsonb);

select assert(
  (select count(*) from public.streak_freezes
    where pair_id = :'pair' and day_index >= public.pair_day_index(:'pair') - 1) = 0
  or public.pair_day_is_open(:'pair', public.pair_day_index(:'pair') - 1) is false,
  'settle never forgives a day whose window is still open'
);

-- It must stop at the first gap it cannot cover rather than spending on history.
delete from public.streak_freezes where pair_id = :'pair';
delete from public.reveals where pair_id = :'pair';

-- Pinned to the first of last month, and that is the whole point of this block.
--
-- The allowance is two per CALENDAR MONTH of the day being forgiven — settle takes
-- its budget from `freezes_left(pair, v_zero + v_day)`, not from today's month. So
-- how many freezes a five-day gap can draw depends on whether those five days sit
-- inside one month or straddle two.
--
-- day_zero was `current_date - 40`, which put the gap in one month on most dates
-- and across a month end on a few. On 6 August 2026 it spanned 29-30 June and
-- 1-2 July, legitimately drew two months' allowances, spent 4, and failed an
-- assertion that reads like it is about a hard cap. Nothing was wrong with the
-- function; the fixture was asserting the calendar.
--
-- First-of-last-month is stable on every date of the year: days 0-6 are the 1st to
-- the 7th of a month that has ended, so they are all closed and all in one month.
update public.pairs
   set day_zero = date_trunc('month', current_date - interval '1 month')::date
 where id = :'pair';

-- Answered 0, then days 1..5 all missed and closed, then answered 6.
insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
select :'pair', d, (select id from public.questions limit 1), 80, '{}'::jsonb
from unnest(array[0, 6]) as d;

select assert(
  public.settle_freezes(:'pair') = 2,
  'settle spends at most one month''s allowance on a gap inside one month'
);

-- The semantics the old assertion left ambiguous, now stated. A freeze belongs to
-- the month of the day it forgives, which is what makes a gap across a month end
-- able to draw on both allowances — deliberate, and worth pinning so nobody
-- "fixes" it into counting against whichever month somebody happened to open the
-- app in.
select assert(
  not exists (
    select 1 from public.streak_freezes f
    join public.pairs p on p.id = f.pair_id
    where f.pair_id = :'pair'
      and f.month <> date_trunc('month', p.day_zero + f.day_index)::date
  ),
  'each freeze is booked to the month of the day it forgives, not to today''s'
);
select assert(
  (select count(*) from public.streak_freezes where pair_id = :'pair') = 2,
  'and no more than that exists'
);
select assert(
  (select min(day_index) from public.streak_freezes where pair_id = :'pair') = 4,
  'spent on the days nearest the run, not on the oldest — a freeze below an '
  'unbridgeable gap changes no number'
);
select assert(
  public.pair_streak(:'pair') = 1,
  'the run is still broken, because two freezes cannot cover five missed days'
);


-- ---------------------------------------------------------------------------
-- Leakage
-- ---------------------------------------------------------------------------

set sync.uid = 'a9000000-0000-0000-0000-0000000000a9';
set role authenticated;

select assert(
  (select count(*) from public.streak_freezes) = 2,
  'a member can read their own pairing''s freezes, so the UI can explain the number'
);

do $$
begin
  insert into public.streak_freezes (pair_id, day_index, month)
  values ('99990000-0000-0000-0000-000000000999', 30, current_date);
  raise exception 'FAILED: a user minted their own freeze';
exception when insufficient_privilege or check_violation then
  raise notice 'ok — there is no API path to mint a freeze';
end $$;

reset role;

select assert(
  has_function_privilege('anon', 'public.settle_freezes(uuid)', 'execute') is false,
  'and settle is not reachable anonymously'
);


-- ---------------------------------------------------------------------------
-- Which clock the allowance is counted on
--
-- It used to be the session's. For a couple far from UTC that meant the dashboard
-- reporting the previous month's allowance for the last hours of the 1st — "none
-- left" on a day that had a fresh two. settle_freezes was already correct, so the
-- function that granted freezes and the one that reported them disagreed.
--
-- Two assertions, because either alone is weak. The behavioural one can pass by
-- luck when the two dates happen to share a month; the structural one cannot, and
-- fails the moment somebody reintroduces a bare current_date.
-- ---------------------------------------------------------------------------

update public.pairs set time_zone = 'Pacific/Kiritimati' where id = :'pair';  -- UTC+14

select assert(
  public.pair_today(:'pair') = (now() at time zone 'Pacific/Kiritimati')::date,
  'pair_today reports the couple''s date, not the server''s'
);

-- The session's date is deliberately set as far from the pair's as Postgres allows.
-- Whatever the answer is, it must not move when the SESSION timezone moves.
set time zone 'Pacific/Kiritimati';
select public.freezes_left(:'pair') as kiritimati \gset
set time zone 'Pacific/Midway';                                               -- UTC-11
select assert(
  public.freezes_left(:'pair') = :kiritimati,
  'and freezes_left does not move when the session timezone does'
);
set time zone 'UTC';

select assert(
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('freezes_left', 'freeze_status')
     and pg_get_functiondef(p.oid) like '%pair_today%') = 2,
  'both freeze readers derive the month from the pair''s clock'
);

rollback;
