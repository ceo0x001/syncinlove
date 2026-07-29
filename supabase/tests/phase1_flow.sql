-- End-to-end exercise of the Phase 1 SQL against a throwaway cluster.
-- Every check raises on failure, so a clean run means every assertion held.

\set QUIET on
\pset pager off

-- Fixed uuids: alice < bob, so alice is always side "a" (ordered by user_id).
\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'
\set carol '33333333-3333-4333-8333-333333333333'

insert into auth.users (id, is_anonymous) values
  (:'alice', true), (:'bob', true), (:'carol', true);

create or replace function assert(p_ok boolean, p_what text)
returns void language plpgsql as $$
begin
  if not p_ok then
    raise exception 'FAILED: %', p_what;
  end if;
  raise notice 'ok — %', p_what;
end $$;

-- ---------------------------------------------------------------------------
-- Alice arrives, creates her pair and invite.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';

insert into public.profiles (id, first_name) values (:'alice', 'Alice');

select assert(
  (public.create_pair('Africa/Lagos', 'hash-a', 'nonce-a', now() + interval '7 days') ->> 'created')::boolean,
  'create_pair creates a pair'
);

select assert(
  (public.create_pair('Africa/Lagos', 'hash-a2', 'nonce-a2', now() + interval '7 days') ->> 'created')::boolean is false,
  'create_pair is idempotent — no second pair for the same person'
);

select assert(public.current_pair_id() is not null, 'alice has an active pair');

-- ---------------------------------------------------------------------------
-- Bob taps the link.
-- ---------------------------------------------------------------------------
select assert(
  (public.peek_invite('hash-a') ->> 'state') = 'open'
  and (public.peek_invite('hash-a') ->> 'inviter_first_name') = 'Alice',
  'peek_invite shows the inviter name and nothing else'
);

select assert(
  (public.peek_invite('no-such-hash') ->> 'state') = 'unknown',
  'peek_invite does not leak on an unknown token'
);

set sync.uid = '22222222-2222-4222-8222-222222222222';
insert into public.profiles (id, first_name) values (:'bob', 'Bob');

select assert(
  (public.claim_invite('hash-a') ->> 'already')::boolean is false,
  'bob claims the invite'
);

select assert(public.current_pair_id() is not null, 'bob is now in the pair');

-- ---------------------------------------------------------------------------
-- One active pair per person, and first-claim-wins.
-- ---------------------------------------------------------------------------
set sync.uid = '33333333-3333-4333-8333-333333333333';
insert into public.profiles (id, first_name) values (:'carol', 'Carol');

do $$
begin
  perform public.claim_invite('hash-a');
  raise exception 'FAILED: carol should not be able to claim a used link';
exception
  when sqlstate 'P0007' then raise notice 'ok — a claimed link cannot be claimed again';
end $$;

-- Carol makes her own pair, then tries to also join Alice and Bob's.
select public.create_pair('UTC', 'hash-c', 'nonce-c', now() + interval '7 days');

set sync.uid = '11111111-1111-4111-8111-111111111111';
do $$
begin
  perform public.claim_invite('hash-c');
  raise exception 'FAILED: alice should not be able to hold two pairings';
exception
  when sqlstate 'P0008' then raise notice 'ok — one active pair per person is enforced';
end $$;

-- ---------------------------------------------------------------------------
-- The calendar.
-- ---------------------------------------------------------------------------
select assert(
  public.pair_day_index(public.current_pair_id()) = 0,
  'the pairing day is day 0'
);

select assert(
  public.pair_day_is_open(public.current_pair_id(), 0),
  'today is open'
);

select assert(
  not public.pair_day_is_open(public.current_pair_id(), 5),
  'a future day is not open'
);

select assert(
  not public.pair_day_is_open(public.current_pair_id(), -1),
  'a negative day is not open'
);

-- The grace window: at 02:00 pair-local tomorrow, yesterday is still open.
select assert(
  public.pair_day_is_open(
    public.current_pair_id(), 0,
    ((current_date + 1)::timestamp + interval '2 hours') at time zone 'Africa/Lagos'
  ),
  'yesterday stays open at 02:00 — the midnight cliff is covered'
);

select assert(
  not public.pair_day_is_open(
    public.current_pair_id(), 0,
    ((current_date + 1)::timestamp + interval '7 hours') at time zone 'Africa/Lagos'
  ),
  'yesterday closes by 07:00'
);

select assert(
  (public.question_for_day(0)).id = 'q-sleep',
  'day 0 is the gentle opener, not a deep question'
);

select assert(
  (public.question_for_day(0)).id = (public.question_for_day(30)).id,
  'the rotation wraps at 30'
);

-- ---------------------------------------------------------------------------
-- Submitting. Alice first — no reveal yet.
-- ---------------------------------------------------------------------------
select assert(
  (public.submit_answer(0,
    '{"quality": 80, "culprit": "nothing"}'::jsonb,
    '{"quality": 40, "culprit": "brain"}'::jsonb) ->> 'state') = 'waiting',
  'the first submission waits'
);

select assert(
  (select count(*) from public.reveals) = 0,
  'nothing is revealed on one answer'
);

select assert(
  not public.partner_answered(0),
  'partner_answered is false before bob answers'
);

-- Immutable: a second attempt changes nothing.
select public.submit_answer(0,
  '{"quality": 5, "culprit": "body"}'::jsonb,
  '{"quality": 5, "culprit": "body"}'::jsonb);

select assert(
  (select self_payload ->> 'quality' from public.answers
   where user_id = :'alice' and day_index = 0) = '80',
  'a submission is immutable — the retry did not overwrite it'
);

select assert(
  (select count(*) from public.answers where user_id = :'alice' and day_index = 0) = 1,
  'no duplicate answer row'
);

-- Rejects bad input.
do $$
begin
  perform public.submit_answer(0, '{"quality": 50}'::jsonb, '{"quality": 50, "culprit": "brain"}'::jsonb);
  raise exception 'FAILED: a missing facet should be rejected';
exception
  when sqlstate '22023' then raise notice 'ok — a missing facet is rejected';
end $$;

do $$
begin
  perform public.submit_answer(0,
    '{"quality": 50, "culprit": "not-an-option"}'::jsonb,
    '{"quality": 50, "culprit": "brain"}'::jsonb);
  raise exception 'FAILED: an invalid option should be rejected';
exception
  when sqlstate '22023' then raise notice 'ok — an invalid choice id is rejected';
end $$;

do $$
begin
  perform public.submit_answer(9,
    '{"quality": 50, "culprit": "brain"}'::jsonb,
    '{"quality": 50, "culprit": "brain"}'::jsonb);
  raise exception 'FAILED: a closed day should be rejected';
exception
  when sqlstate 'P0003' then raise notice 'ok — a day outside the window is rejected';
end $$;

-- ---------------------------------------------------------------------------
-- Bob submits. The reveal materializes.
-- ---------------------------------------------------------------------------
set sync.uid = '22222222-2222-4222-8222-222222222222';

select assert(
  public.partner_answered(0),
  'partner_answered is true once alice has answered'
);

select assert(
  (public.submit_answer(0,
    '{"quality": 30, "culprit": "brain"}'::jsonb,
    '{"quality": 90, "culprit": "noise"}'::jsonb) ->> 'state') = 'revealed',
  'the second submission reveals'
);

-- Hand-computed against src/lib/sync/score.ts:
--   alice read bob : quality |40-30|=10 -> 80 ; culprit brain==brain -> 100 ; mean 90
--   bob read alice : quality |90-80|=10 -> 80 ; culprit noise!=nothing -> 0 ; mean 40
--   sync           : (90+40)/2 = 65
select assert(
  (select sync_score from public.reveals where day_index = 0) = 65,
  'sync score is 65, matching the TypeScript engine'
);

select assert(
  (select (payload -> 'a_read_b' ->> 'total')::int from public.reveals where day_index = 0) = 90,
  'alice read bob at 90'
);

select assert(
  (select (payload -> 'b_read_a' ->> 'total')::int from public.reveals where day_index = 0) = 40,
  'bob read alice at 40'
);

select assert(
  (select payload -> 'a' ->> 'user_id' from public.reveals where day_index = 0) = :'alice',
  'sides are ordered deterministically by user id'
);

select assert(
  (select status from public.pairs where id = public.current_pair_id()) = 'active',
  'the pairing flips from pending to active'
);

-- ---------------------------------------------------------------------------
-- RLS, as a real non-owner role. This is the check that matters.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'x';
    grant authenticated to app_user;
  end if;
end $$;

set role app_user;
set sync.uid = '11111111-1111-4111-8111-111111111111';

select assert(
  (select count(*) from public.answers) = 1,
  'alice sees exactly one answer row — her own'
);

select assert(
  (select count(*) from public.answers where user_id = :'bob') = 0,
  'alice CANNOT read bob''s answer, even after the reveal'
);

select assert(
  (select count(*) from public.reveals) = 1,
  'alice can read the reveal'
);

select assert(
  (select count(*) from public.profiles) = 2,
  'alice sees her own profile and her partner''s, not carol''s'
);

select assert(
  (select count(*) from public.invites) = 1,
  'alice sees only the invite she created'
);

-- Writes are closed off entirely.
do $$
begin
  insert into public.answers (pair_id, day_index, question_id, user_id, self_payload, guess_payload)
  values (public.current_pair_id(), 1, 'q-help-this-week', auth.uid(), '{}'::jsonb, '{}'::jsonb);
  raise exception 'FAILED: a direct insert into answers should be denied';
exception
  when insufficient_privilege then raise notice 'ok — answers cannot be written directly';
end $$;

do $$
begin
  update public.answers set self_payload = '{"quality": 1}'::jsonb;
  raise exception 'FAILED: updating an answer should be denied';
exception
  when insufficient_privilege then raise notice 'ok — an answer cannot be edited';
end $$;

do $$
begin
  insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
  values (public.current_pair_id(), 2, 'q-sleep', 100, '{}'::jsonb);
  raise exception 'FAILED: forging a reveal should be denied';
exception
  when insufficient_privilege then raise notice 'ok — a reveal cannot be forged';
end $$;

-- Carol is a complete stranger to this pair.
set sync.uid = '33333333-3333-4333-8333-333333333333';

select assert((select count(*) from public.answers) = 0, 'carol sees no answers');
select assert((select count(*) from public.reveals) = 0, 'carol sees no reveals');
select assert(
  (select count(*) from public.pair_members where pair_id <> public.current_pair_id()) = 0,
  'carol cannot enumerate another pair''s membership'
);

reset role;

-- ---------------------------------------------------------------------------
-- The 24-hour undo on a mis-sent link.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';

select assert((public.revoke_claim() ->> 'ok')::boolean, 'alice can undo a mis-sent link');

select assert(
  (select count(*) from public.pair_members where pair_id = public.current_pair_id() and left_at is null) = 1,
  'the wrong person is removed from the pairing'
);

select assert((select count(*) from public.reveals) = 0, 'the reveal is cleared with them');
select assert((select count(*) from public.answers where user_id = :'bob') = 0, 'their answers go too');
select assert(
  (public.peek_invite('hash-a') ->> 'state') = 'open',
  'the link reopens so it can be sent to the right person'
);

-- Bob, now unpaired, is free to be invited by somebody else.
set sync.uid = '22222222-2222-4222-8222-222222222222';
select assert(public.current_pair_id() is null, 'the removed partner is fully unpaired');

\echo ''
\echo 'ALL SQL ASSERTIONS PASSED'
