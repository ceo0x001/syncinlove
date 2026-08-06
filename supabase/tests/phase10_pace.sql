-- ============================================================================
-- Phase 10: pace, and the day-to-question assignment
--
-- THE ASSERTION THIS SUITE EXISTS FOR
--
-- A question a pair has already been asked is never asked again in the first pass.
--
-- Everything else is detail. That one rule is what makes the bank safe to reshape:
-- every reorder shipped so far was safe only because it landed past day 60 where
-- nobody was, and the spiral reorders from day 13. If an assigned day can move, or an
-- answered question can come back, then regrowing the bank silently re-asks people
-- things they have already answered — and a trait question asked twice scores full
-- marks from memory and pays tender for remembering.
--
-- The second reason this suite matters is concurrency. Both partners open the app in
-- the same second; both find the day unassigned; both try to claim it. If they end up
-- with different questions for the same day the entire product is broken, because the
-- whole premise is that they answered the same thing.
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

\set ada 'aa000000-0000-0000-0000-0000000000aa'
\set bo  'bb000000-0000-0000-0000-0000000000bb'
\set cy  'cc000000-0000-0000-0000-0000000000cc'
\set dee 'dd000000-0000-0000-0000-0000000000dd'
\set pair 'aaaa0000-0000-0000-0000-00000000aaaa'
\set pair2 'bbbb0000-0000-0000-0000-00000000bbbb'

insert into auth.users (id, email, is_anonymous) values
  (:'ada', 'ada10@example.com', false),
  (:'bo',  'bo10@example.com',  false),
  (:'cy',  'cy10@example.com',  false),
  (:'dee', 'dee10@example.com', false);
insert into public.profiles (id, first_name) values
  (:'ada', 'Ada'), (:'bo', 'Bo'), (:'cy', 'Cy'), (:'dee', 'Dee');

insert into public.pairs (id, time_zone, day_zero, status) values
  (:'pair',  'UTC', current_date - 40, 'active'),
  (:'pair2', 'UTC', current_date - 40, 'active');
insert into public.pair_members (pair_id, user_id, role) values
  (:'pair',  :'ada', 'inviter'), (:'pair',  :'bo',  'invitee'),
  (:'pair2', :'cy',  'inviter'), (:'pair2', :'dee', 'invitee');

/*
  Who is asking, for the rest of the file.

  question_for_pair_day refuses a pairing the caller is not in, so every call has to
  come from somebody. This suite used to call it as the table owner with no sync.uid,
  which is nobody — and it passed, because the guard did not exist yet. Adding the
  guard broke thirteen assertions at once, which is the guard doing its job on the
  tests before it does it on a stranger.

  Ada for :pair, Cy for :pair2, switched at each section boundary.
*/
set sync.uid = 'aa000000-0000-0000-0000-0000000000aa';


-- ---------------------------------------------------------------------------
-- The orderings themselves
-- ---------------------------------------------------------------------------

select assert(
  (select count(distinct pace) from public.question_order) = 3,
  'three paces are ordered'
);

-- A pace missing one question is a pace whose couples never see it, and nothing else
-- in the schema would notice.
select assert(
  not exists (
    select 1
    from public.question_order o
    group by o.pace
    having count(*) <> (select count(*) from public.questions)
  ),
  'every pace orders the whole bank, exactly once each'
);

select assert(
  not exists (
    select 1 from public.question_order o
    left join public.questions q on q.id = o.question_id
    where q.id is null
  ),
  'no pace references a question that does not exist'
);

-- Contiguous from zero. A gap would make the walk skip a position silently rather
-- than fail.
select assert(
  not exists (
    select 1 from public.question_order o
    group by o.pace
    having min(o.position) <> 0 or max(o.position) <> count(*) - 1
  ),
  'positions run from zero with no gaps'
);

select assert(
  (select count(distinct question_id) from public.question_order where position = 0) = 1,
  'every pace opens on the same question, so nobody''s first day depends on a setting'
);


-- ---------------------------------------------------------------------------
-- Assignment
-- ---------------------------------------------------------------------------

select assert(
  (select pace from public.pairs where id = :'pair') = 'standard',
  'a pairing defaults to standard, so existing couples keep the pacing they have'
);

select (public.question_for_pair_day(:'pair', 0)).id as day0 \gset

select assert(
  :'day0' = (select question_id from public.question_order
             where pace = 'standard' and position = 0),
  'day 0 is the first question of the pair''s ordering'
);

select assert(
  (select question_id from public.pair_days where pair_id = :'pair' and day_index = 0)
    = :'day0',
  'and asking wrote it down'
);

select assert(
  (public.question_for_pair_day(:'pair', 0)).id = :'day0',
  'asking again returns the same question — the decision is recorded, not recomputed'
);


-- ---------------------------------------------------------------------------
-- A reshaped bank cannot move a day already asked
--
-- The assertion that makes regrowing and repacing the bank safe. Simulated by moving
-- an assigned question to the end of the ordering, which is what a reorder does.
-- ---------------------------------------------------------------------------

savepoint before_reshape;

update public.question_order
   set position = position + 10000
 where pace = 'standard' and question_id = :'day0';

select assert(
  (public.question_for_pair_day(:'pair', 0)).id = :'day0',
  'moving a question to the end of the ordering does not change a day already asked'
);

rollback to savepoint before_reshape;


-- ---------------------------------------------------------------------------
-- Never the same question twice
-- ---------------------------------------------------------------------------

do $$
declare
  v_pair uuid := 'aaaa0000-0000-0000-0000-00000000aaaa';
  v_day  int;
begin
  for v_day in 0..99 loop
    perform public.question_for_pair_day(v_pair, v_day);
  end loop;
end $$;

select assert(
  (select count(*) from public.pair_days where pair_id = :'pair') = 100,
  'a hundred days assign a hundred rows'
);

select assert(
  (select count(distinct question_id) from public.pair_days where pair_id = :'pair') = 100,
  'a hundred days across a hundred DIFFERENT questions — nothing is asked twice'
);

-- And in the pace's own order, since the walk takes the first unasked by position.
select assert(
  not exists (
    select 1
    from public.pair_days d
    join public.question_order o
      on o.pace = 'standard' and o.question_id = d.question_id
    where d.pair_id = :'pair'
      and o.position <> d.day_index
  ),
  'and in the ordering''s own order while nothing has been skipped'
);


-- ---------------------------------------------------------------------------
-- Changing pace mid-rotation
--
-- Nothing already asked moves; only what comes next changes. And the new ordering is
-- still walked for the first unasked question, so a pace change cannot re-ask.
-- ---------------------------------------------------------------------------

select (public.question_for_pair_day(:'pair', 100)).id as before_switch \gset

update public.pairs set pace = 'bold' where id = :'pair';

select assert(
  (public.question_for_pair_day(:'pair', 0)).id = :'day0',
  'changing pace leaves every day already asked exactly where it was'
);

select assert(
  (public.question_for_pair_day(:'pair', 100)).id = :'before_switch',
  'including the most recent one'
);

select (public.question_for_pair_day(:'pair', 101)).id as after_switch \gset

select assert(
  not exists (
    select 1 from public.pair_days
    where pair_id = :'pair' and question_id = :'after_switch' and day_index <> 101
  ),
  'and the next question is one they have never been asked, on the new pace'
);

select assert(
  (select count(distinct question_id) from public.pair_days where pair_id = :'pair')
    = (select count(*) from public.pair_days where pair_id = :'pair'),
  'so a pace change cannot re-ask anything'
);

update public.pairs set pace = 'standard' where id = :'pair';


set sync.uid = 'cc000000-0000-0000-0000-0000000000cc';   -- Cy, for :pair2

-- ---------------------------------------------------------------------------
-- Two partners, one day, at the same moment
--
-- Both find the day unassigned and both claim it. The primary key settles it and the
-- loser must read the winner's row — returning its own choice would hand the couple
-- two different questions for one day, which is the one outcome this table exists to
-- make impossible.
-- ---------------------------------------------------------------------------

do $$
declare
  v_pair uuid := 'bbbb0000-0000-0000-0000-00000000bbbb';
  v_a    text;
  v_b    text;
begin
  -- Simulating the race directly: pre-insert what "the other partner" won with, then
  -- ask, which is the state the loser finds itself in after its own insert no-ops.
  insert into public.pair_days (pair_id, day_index, question_id)
  values (v_pair, 5, (select question_id from public.question_order
                      where pace = 'standard' and position = 40));

  v_a := (public.question_for_pair_day(v_pair, 5)).id;
  v_b := (select question_id from public.question_order
          where pace = 'standard' and position = 40);

  if v_a <> v_b then
    raise exception 'FAILED: the loser of a race returned its own choice (% not %)', v_a, v_b;
  end if;
  raise notice 'ok — a simultaneous second claim yields to the row that won';
end $$;

select assert(
  (select count(*) from public.pair_days where pair_id = :'pair2' and day_index = 5) = 1,
  'and only one row exists for that day'
);


-- ---------------------------------------------------------------------------
-- Two pairs do not share an assignment
-- ---------------------------------------------------------------------------

select assert(
  (public.question_for_pair_day(:'pair2', 0)).id = :'day0',
  'a second pairing on the same pace opens on the same question'
);

select assert(
  (select count(*) from public.pair_days where pair_id = :'pair2') = 2,
  'and its own rows are its own — assigning for one pair does not assign for another'
);


-- ---------------------------------------------------------------------------
-- Running dry
--
-- Past the end of the bank it cycles the renewable questions only. A trait question
-- asked again scores full marks from memory, which would inflate scores across a
-- second pass and, since accuracy pays tender, inflate the economy with them.
-- ---------------------------------------------------------------------------

do $$
declare
  v_pair  uuid := 'bbbb0000-0000-0000-0000-00000000bbbb';
  v_total int;
  v_day   int;
begin
  select count(*) into v_total from public.questions;
  delete from public.pair_days where pair_id = v_pair;

  for v_day in 0..(v_total + 19) loop
    perform public.question_for_pair_day(v_pair, v_day);
  end loop;

  for v_day in v_total..(v_total + 19) loop
    if not (select q.renewable
            from public.pair_days d
            join public.questions q on q.id = d.question_id
            where d.pair_id = v_pair and d.day_index = v_day) then
      raise exception 'FAILED: day % past the end served a non-renewable question', v_day;
    end if;
  end loop;

  raise notice 'ok — past the end of the bank only renewable questions come back';
end $$;

select assert(
  (select count(distinct question_id) from public.pair_days
    where pair_id = :'pair2' and day_index < (select count(*) from public.questions))
    = (select count(*) from public.questions),
  'and the whole bank was served exactly once before any of it repeated'
);


set sync.uid = 'aa000000-0000-0000-0000-0000000000aa';   -- Ada again, for :pair

-- ---------------------------------------------------------------------------
-- The backfill
--
-- A day where only one partner submitted has an answers row and no reveal, and it is
-- still a day that pair was asked. Missing it would re-ask the question later, which
-- is the exact failure pair_days exists to prevent.
-- ---------------------------------------------------------------------------

savepoint before_backfill;

delete from public.pair_days where pair_id = :'pair';

insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
values (:'pair', 3, (select question_id from public.question_order
                     where pace = 'standard' and position = 90), 70, '{}'::jsonb);

insert into public.answers (pair_id, day_index, question_id, user_id, self_payload, guess_payload)
values (:'pair', 4, (select question_id from public.question_order
                     where pace = 'standard' and position = 91),
        :'ada', '{}'::jsonb, '{}'::jsonb);

-- Re-running the migration's backfill.
insert into public.pair_days (pair_id, day_index, question_id, assigned_at)
select r.pair_id, r.day_index, r.question_id, r.revealed_at
from public.reveals r
on conflict (pair_id, day_index) do nothing;

insert into public.pair_days (pair_id, day_index, question_id, assigned_at)
select distinct on (a.pair_id, a.day_index)
       a.pair_id, a.day_index, a.question_id, a.submitted_at
from public.answers a
order by a.pair_id, a.day_index, a.submitted_at
on conflict (pair_id, day_index) do nothing;

select assert(
  (select count(*) from public.pair_days where pair_id = :'pair') = 2,
  'the backfill picks up a revealed day and a half-answered one'
);

select assert(
  (select question_id from public.pair_days where pair_id = :'pair' and day_index = 4)
    = (select question_id from public.question_order where pace = 'standard' and position = 91),
  'including the day only one partner submitted'
);

-- The point of backfilling: those two are now unaskable again.
select (public.question_for_pair_day(:'pair', 5)).id as next_after_backfill \gset

select assert(
  :'next_after_backfill' <> (select question_id from public.pair_days
                             where pair_id = :'pair' and day_index = 3)
  and :'next_after_backfill' <> (select question_id from public.pair_days
                                 where pair_id = :'pair' and day_index = 4),
  'and a question answered under the old ordering is never asked again under the new one'
);

rollback to savepoint before_backfill;


-- ---------------------------------------------------------------------------
-- set_pace
-- ---------------------------------------------------------------------------

set sync.uid = 'aa000000-0000-0000-0000-0000000000aa';
set role authenticated;

select public.set_pace('bold');
select assert(
  (select pace from public.pairs where id = :'pair') = 'bold',
  'either partner can set the pairing''s pace'
);

do $$
begin
  perform public.set_pace('reckless');
  raise exception 'FAILED: an unknown pace was accepted';
exception when sqlstate '22023' then
  raise notice 'ok — an unknown pace is refused rather than stored';
end $$;

select public.set_pace('standard');


-- ---------------------------------------------------------------------------
-- Leakage
-- ---------------------------------------------------------------------------

select assert(
  (select count(*) from public.pair_days where pair_id = :'pair2') = 0,
  'a member cannot read another pairing''s assignments'
);

select assert(
  (select count(*) from public.pair_days) > 0,
  'while reading their own, so the UI can show what today is'
);

do $$
begin
  insert into public.pair_days (pair_id, day_index, question_id)
  values ('aaaa0000-0000-0000-0000-00000000aaaa', 900,
          (select id from public.questions limit 1));
  raise exception 'FAILED: a user assigned their own question';
exception when insufficient_privilege then
  raise notice 'ok — there is no API path to choose your own question';
end $$;

/*
  And no direct write to pairs at all.

  This was written expecting RLS to filter the update down to zero rows. It does not
  get that far: there is no table-level UPDATE grant on pairs for authenticated, so
  the attempt is refused outright. That is the stronger property of the two — RLS
  filtering means a policy bug becomes a data bug, whereas a missing grant means
  there is no path to find a bug in. Worth asserting the thing that is actually
  true, and worth knowing it is stricter than assumed.
*/
do $$
begin
  update public.pairs set pace = 'bold'
   where id = 'bbbb0000-0000-0000-0000-00000000bbbb';
  if found then
    raise exception 'FAILED: a user set another pairing''s pace directly';
  end if;
  raise notice 'ok — RLS filtered a direct repace of somebody else''s pairing';
exception when insufficient_privilege then
  raise notice 'ok — pairs is not directly writable at all, so pace only moves through set_pace';
end $$;

reset role;

/*
  The assertion that was missing, and the reason this suite gave false comfort.

  A member reaching into a pairing they are not in. question_for_pair_day takes a
  pair_id, is SECURITY DEFINER, and originally never asked whether the caller belonged
  to it — so anyone who could execute it could read AND assign a day for a stranger's
  pairing, since the function writes.

  Nothing here caught that. The privilege assertion below passed while being false in
  production: Supabase's project-level default privileges grant EXECUTE on new functions
  to anon BY NAME, and 0022 only revoked from PUBLIC. `has_function_privilege` was
  answering truthfully about a throwaway database that has no such defaults — a true
  statement about the wrong machine.

  Found by calling the deployed function as anon and reading the response, which is the
  only place the difference was visible. The grant is now revoked from anon explicitly,
  which is what makes the assertion mean the same thing in both environments.
*/
set sync.uid = 'aa000000-0000-0000-0000-0000000000aa';
set role authenticated;

do $$
begin
  perform public.question_for_pair_day('bbbb0000-0000-0000-0000-00000000bbbb', 3);
  raise exception 'FAILED: a member read a question for a pairing they are not in';
exception when sqlstate 'P0002' then
  raise notice 'ok — a member cannot ask about a pairing they are not in';
end $$;

select assert(
  not exists (
    select 1 from public.pair_days
    where pair_id = 'bbbb0000-0000-0000-0000-00000000bbbb' and day_index = 3
  ),
  'and the refused call assigned nothing — it writes, so a bare read check is not enough'
);

-- Their own pairing still works, so the guard refuses rather than breaks.
select assert(
  (public.question_for_pair_day('aaaa0000-0000-0000-0000-00000000aaaa', 0)).id is not null,
  'while their own pairing answers exactly as before'
);

reset role;

select assert(
  has_function_privilege('anon', 'public.question_for_pair_day(uuid, int)', 'execute')
    is false,
  'assignment is not reachable anonymously'
);

select assert(
  has_function_privilege('anon', 'public.set_pace(text)', 'execute') is false,
  'and neither is setting a pace'
);

rollback;
