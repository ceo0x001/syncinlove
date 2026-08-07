-- End-to-end exercise of the Phase 3 economy against a throwaway cluster.
-- Every check raises on failure, so a clean run means every assertion held.

\set QUIET on
\pset pager off

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'

insert into auth.users (id, email, is_anonymous) values
  (:'alice', 'alice@example.com', false),
  (:'bob',   'bob@example.com',   false);

create or replace function assert(p_ok boolean, p_what text)
returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'FAILED: %', p_what; end if;
  raise notice 'ok — %', p_what;
end $$;

-- ---------------------------------------------------------------------------
-- Pair them up and complete day 0.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';
insert into public.profiles (id, first_name) values (:'alice', 'Alice');
select public.create_pair('UTC', 'h', 'n', now() + interval '7 days');

set sync.uid = '22222222-2222-4222-8222-222222222222';
insert into public.profiles (id, first_name) values (:'bob', 'Bob');
select public.claim_invite('h');

-- Day 0 is q-sleep: scale 'quality' + choice 'culprit' (neutral: 'nothing').
set sync.uid = '11111111-1111-4111-8111-111111111111';
select public.submit_answer(0,
  '{"quality": 80, "culprit": "brain"}'::jsonb,
  '{"quality": 40, "culprit": "brain"}'::jsonb);

set sync.uid = '22222222-2222-4222-8222-222222222222';
select public.submit_answer(0,
  '{"quality": 30, "culprit": "brain"}'::jsonb,
  '{"quality": 90, "culprit": "brain"}'::jsonb);

-- alice read bob: |40-30|=10 -> 80 ; brain==brain -> 100 ; mean 90
-- bob read alice: |90-80|=10 -> 80 ; brain==brain -> 100 ; mean 90
-- sync 90 -> payout 10,000 + round(30,000*0.9)=27,000 -> 37,000
select assert(
  (select sync_score from public.reveals where day_index = 0) = 90,
  'day 0 scores 90'
);

select assert(public.tender_payout_for_score(90) = 37000, 'a 90 pays T37,000');
select assert(public.tender_payout_for_score(0) = 10000, 'a zero day still pays the completion floor');
select assert(public.tender_payout_for_score(100) = 40000, 'a perfect day pays exactly the cap');

select assert(
  public.tender_balance(:'alice') = 37000 and public.tender_balance(:'bob') = 37000,
  'both wallets credited the same amount'
);

select assert(
  (select count(*) from public.tender_entries where reason = 'reveal') = 2,
  'one ledger entry per person'
);

-- Idempotent: resubmitting must not pay twice.
set sync.uid = '11111111-1111-4111-8111-111111111111';
select public.submit_answer(0,
  '{"quality": 80, "culprit": "brain"}'::jsonb,
  '{"quality": 40, "culprit": "brain"}'::jsonb);
select assert(public.tender_balance(:'alice') = 37000, 'a repeat submission does not pay twice');

do $$
begin
  perform public.pay_out_reveal(public.current_pair_id(), 0);
  perform public.pay_out_reveal(public.current_pair_id(), 0);
end $$;
select assert(public.tender_balance(:'alice') = 37000, 'pay_out_reveal is idempotent');

-- ---------------------------------------------------------------------------
-- The neutral discount. Both shrug -> the choice facet scores half, not full.
-- ---------------------------------------------------------------------------
select assert(
  public.score_facet('choice', '"nothing"'::jsonb, '"nothing"'::jsonb,
    '[{"id":"nothing","neutral":true},{"id":"brain"}]'::jsonb) = 50,
  'a mutual non-answer scores half, not full'
);
select assert(
  public.score_facet('choice', '"brain"'::jsonb, '"brain"'::jsonb,
    '[{"id":"nothing","neutral":true},{"id":"brain"}]'::jsonb) = 100,
  'a real matched answer still scores full'
);
select assert(
  public.score_facet('choice', '"nothing"'::jsonb, '"brain"'::jsonb,
    '[{"id":"nothing","neutral":true},{"id":"brain"}]'::jsonb) = 0,
  'a missed guess is still zero'
);

-- ---------------------------------------------------------------------------
-- Renewable rotation. Past the first pass, only renewable questions.
-- ---------------------------------------------------------------------------
-- No hardcoded total. The bank grows in batches toward two years of unique days, and a
-- magic number here fails on every batch and gets bumped without being read. What
-- matters is that every seeded question has a place in every pace's ordering.
--
-- Rewritten for 0025, which dropped question_for_day(int) and sequence_position. The
-- recycling assertions this block used to carry — nothing non-renewable ever comes
-- back, the wrap lands on a renewable question — are now in phase10_pace.sql, walked
-- against a real pairing past the end of its bank rather than against a global index.
select assert(
  (select count(*) from public.questions q
    where not exists (
      select 1 from public.question_order o where o.question_id = q.id
    )) = 0,
  'every seeded question has a place in the rotation'
);

-- ---------------------------------------------------------------------------
-- Menus. Own only.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';
select public.upsert_menu_item(null, 'Back rub', 40000);
select public.upsert_menu_item(null, 'I handle dinner all week', 150000);
select public.upsert_menu_item(null, 'You pick the film, no complaints', 10000);

select assert(
  (select count(*) from public.menu_items where owner_id = :'alice') = 3,
  'alice has three items'
);

do $$
declare v_item uuid;
begin
  select id into v_item from public.menu_items where owner_id = '11111111-1111-4111-8111-111111111111' limit 1;
  set local sync.uid = '22222222-2222-4222-8222-222222222222';
  begin
    perform public.upsert_menu_item(v_item, 'Hijacked', 999);
    raise exception 'FAILED: bob must not be able to edit alice''s item';
  exception when sqlstate '42501' or sqlstate '22023' then
    raise notice 'ok — you cannot edit your partner''s menu';
  end;
end $$;

do $$
begin
  perform public.upsert_menu_item(null, 'Absurd', 400001);
  raise exception 'FAILED: price ceiling not enforced';
exception when sqlstate '22023' then
  raise notice 'ok — nothing can be priced beyond reach';
end $$;

-- Price changes are logged rather than silent.
do $$
declare v_item uuid;
begin
  select id into v_item from public.menu_items
  where owner_id = '11111111-1111-4111-8111-111111111111' and title = 'Back rub';
  perform public.upsert_menu_item(v_item, 'Back rub', 90000);
end $$;
select assert(
  (select count(*) from public.menu_price_changes where old_price = 40000 and new_price = 90000) = 1,
  'a price change is recorded, not silent'
);

-- ---------------------------------------------------------------------------
-- Buying. Gated on your own menu.
-- ---------------------------------------------------------------------------
set sync.uid = '22222222-2222-4222-8222-222222222222';

do $$
begin
  perform public.buy_menu_item((select id from public.menu_items where title = 'Back rub'));
  raise exception 'FAILED: bob has no menu of his own and should be blocked';
exception when sqlstate 'P0013' then
  raise notice 'ok — you must offer something before you can spend';
end $$;

select public.upsert_menu_item(null, 'Coffee in bed', 20000);
select public.upsert_menu_item(null, 'Airport run', 120000);
select public.upsert_menu_item(null, 'I deal with the bins all month', 60000);

-- Back rub was repriced to T90,000 above; bob holds T37,000.
do $$
begin
  perform public.buy_menu_item((select id from public.menu_items where title = 'Back rub'));
  raise exception 'FAILED: an unaffordable purchase should be refused';
exception when sqlstate 'P0016' then
  raise notice 'ok — you cannot buy what you cannot afford';
end $$;

select assert(
  (select count(*) from public.purchases) = 0,
  'a refused purchase leaves no record behind'
);

select assert(public.tender_balance(:'bob') = 37000, 'a failed purchase moves no money');

-- Buy something affordable.
do $$
begin
  perform public.buy_menu_item(
    (select id from public.menu_items where title = 'You pick the film, no complaints')
  );
end $$;

select assert(public.tender_balance(:'bob') = 27000, 'buying debits the buyer');
select assert(public.tender_balance(:'alice') = 37000, 'buying does not credit the seller');
select assert(
  (select status from public.purchases limit 1) = 'requested',
  'a purchase starts as a request, not a done deal'
);

-- Only the buyer closes it.
do $$
begin
  set local sync.uid = '11111111-1111-4111-8111-111111111111';
  perform public.mark_purchase_fulfilled((select id from public.purchases limit 1));
  raise exception 'FAILED: the seller must not be able to close their own ticket';
exception when sqlstate '42501' then
  raise notice 'ok — only the buyer can mark it done';
end $$;

set sync.uid = '22222222-2222-4222-8222-222222222222';
select public.mark_purchase_fulfilled((select id from public.purchases limit 1));
select assert(
  (select status from public.purchases limit 1) = 'fulfilled',
  'the buyer can mark it done'
);

-- Honouring a request pays the person who honoured it. The tender was held
-- against the purchase from the moment it was asked for; it moves now.
select assert(public.tender_balance(:'bob') = 27000, 'the buyer is not debited twice');
select assert(
  public.tender_balance(:'alice') = 37000 + 10000,
  'confirming it done pays the seller'
);
select assert(
  public.tender_received(:'alice') = 10000,
  'received is tracked apart from earned'
);

-- The Rich List must not be wash-tradable by passing tender back and forth.
select assert(
  public.tender_earned(:'alice') = 37000,
  'a transfer does not count as earning'
);

-- Fulfilment can only pay once.
do $$
begin
  perform public.mark_purchase_fulfilled((select id from public.purchases limit 1));
exception when sqlstate '42501' then
  raise notice 'ok — a settled purchase cannot be marked done again';
end $$;
select assert(
  (select count(*) from public.tender_entries where reason = 'fulfilled') = 1,
  'a purchase pays its seller exactly once'
);

-- ---------------------------------------------------------------------------
-- Declining refunds in full. This is what makes tender a nudge, not a debt.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.buy_menu_item((select id from public.menu_items where title = 'I handle dinner all week'));
exception when sqlstate 'P0016' then
  raise notice '(bob cannot afford dinner; buying the film again instead)';
end $$;

do $$
declare v_p uuid;
begin
  perform public.buy_menu_item(
    (select id from public.menu_items where title = 'You pick the film, no complaints')
  );
  select id into v_p from public.purchases where status = 'requested' limit 1;

  set local sync.uid = '11111111-1111-4111-8111-111111111111';
  perform public.decline_purchase(v_p);
end $$;

select assert(
  (select count(*) from public.purchases where status = 'declined') = 1,
  'the seller can decline'
);
select assert(public.tender_balance(:'bob') = 27000, 'declining refunds in full');
select assert(
  public.tender_balance(:'alice') = 47000,
  'declining pays the seller nothing — the money goes back, not across'
);
select assert(
  (select count(*) from public.tender_entries where reason = 'refund') = 1,
  'the refund is a ledger entry, not an edit'
);

-- A settled purchase can't be re-declined for a second refund.
do $$
declare v_p uuid;
begin
  select id into v_p from public.purchases where status = 'declined' limit 1;
  perform public.decline_purchase(v_p);
  raise exception 'FAILED: a settled purchase should not be re-declinable';
exception when sqlstate 'P0017' then
  raise notice 'ok — a settled purchase cannot be refunded twice';
end $$;

-- ---------------------------------------------------------------------------
-- Earned vs held. The Rich List must rank on earned.
-- ---------------------------------------------------------------------------
select assert(
  public.tender_earned(:'bob') = 37000,
  'earned counts payouts only — spending does not reduce it'
);
select assert(
  public.tender_held() = 0,
  'nothing is left held once every request has settled'
);
select assert(
  public.tender_earned(:'bob') > public.tender_balance(:'bob'),
  'a spender has earned more than they hold, which is why the list ranks on earned'
);

-- ---------------------------------------------------------------------------
-- The solo floor.
-- ---------------------------------------------------------------------------
select assert(public.settle_open_days() = 0, 'nothing to settle while days are open or revealed');

-- ---------------------------------------------------------------------------
-- RLS, as a real non-owner role.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'x';
    grant authenticated to app_user;
  end if;
end $$;

set role app_user;
set sync.uid = '22222222-2222-4222-8222-222222222222';

select assert((select count(*) from public.menu_items) = 6, 'both menus are visible inside the pair');
select assert((select count(*) from public.tender_entries) > 0, 'the ledger is visible inside the pair');

do $$
begin
  insert into public.tender_entries (pair_id, user_id, amount, reason)
  values (public.current_pair_id(), auth.uid(), 10000, 'adjustment');
  raise exception 'FAILED: minting tender directly should be denied';
exception when insufficient_privilege then
  raise notice 'ok — tender cannot be minted directly';
end $$;

do $$
begin
  update public.tender_entries set amount = 9999;
  raise exception 'FAILED: editing the ledger should be denied';
exception when insufficient_privilege then
  raise notice 'ok — the ledger cannot be edited';
end $$;

do $$
begin
  update public.menu_items set price = 1 where owner_id = '11111111-1111-4111-8111-111111111111';
  raise exception 'FAILED: direct menu writes should be denied';
exception when insufficient_privilege then
  raise notice 'ok — menus cannot be written directly';
end $$;

do $$
begin
  update public.purchases set status = 'fulfilled';
  raise exception 'FAILED: direct purchase writes should be denied';
exception when insufficient_privilege then
  raise notice 'ok — purchases cannot be written directly';
end $$;

reset role;

\echo ''
\echo 'ALL PHASE 3 ASSERTIONS PASSED'

-- ===========================================================================
-- Rescale and streak milestones (0003)
-- ===========================================================================

-- These must match src/lib/tender.ts, which the TS suite asserts separately.
select assert(public.tender_completion()   = 10000,  'completion is T10,000');
select assert(public.tender_accuracy_max() = 30000,  'accuracy tops out at T30,000');
select assert(public.tender_daily_cap()    = 40000,  'the daily cap is T40,000');
select assert(
  public.tender_completion() + public.tender_accuracy_max() = public.tender_daily_cap(),
  'completion plus accuracy is exactly the cap'
);

-- The x10 rule is a ratio, so it survives any redenomination.
select assert(
  public.menu_price_ceiling() = public.tender_daily_cap() * 10,
  'a menu item still caps at ten perfect days'
);

select assert(public.tender_payout_for_score(0)   = 10000, 'a total miss still pays the floor');
select assert(public.tender_payout_for_score(100) = 40000, 'a perfect read pays the cap');
select assert(public.tender_payout_for_score(78)  = 33400, 'a 78 pays T33,400');

-- ---------------------------------------------------------------------------
-- pair_streak counts the contiguous run from the newest reveal.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';

do $$
declare v_pair uuid := public.current_pair_id();
begin
  -- Day 0 already exists from the earlier flow. Add a gap, then a run.
  insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
  select v_pair, d, 'q-sleep', 100, '{}'::jsonb
  from unnest(array[5, 6, 7]) d
  on conflict do nothing;
end $$;

-- Reveals now at 0, 5, 6, 7 -> the run ending at 7 is three long.
select assert(
  public.pair_streak(public.current_pair_id()) = 3,
  'the streak counts back from the newest reveal and stops at the gap'
);

do $$
declare v_pair uuid := public.current_pair_id();
begin
  insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
  select v_pair, d, 'q-sleep', 100, '{}'::jsonb
  from unnest(array[1, 2, 3, 4]) d
  on conflict do nothing;
end $$;

-- Now 0..7 contiguous.
select assert(
  public.pair_streak(public.current_pair_id()) = 8,
  'filling the gap joins the runs'
);

-- ---------------------------------------------------------------------------
-- Milestones pay once, to both partners, and count as earned.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.award_streak_milestones(public.current_pair_id());
end $$;

select assert(
  (select count(*) from public.tender_entries where reason = 'streak' and milestone = 7) = 2,
  'the 7-day milestone pays both partners'
);
select assert(
  (select count(*) from public.tender_entries where reason = 'streak' and milestone = 14) = 0,
  'a milestone beyond the streak is not paid'
);
select assert(
  (select amount from public.tender_entries where reason = 'streak' and milestone = 7 limit 1) = 25000,
  'the 7-day bonus is T25,000'
);

-- Farming guard: re-running must not pay again.
do $$
begin
  perform public.award_streak_milestones(public.current_pair_id());
  perform public.award_streak_milestones(public.current_pair_id());
end $$;
select assert(
  (select count(*) from public.tender_entries where reason = 'streak' and milestone = 7) = 2,
  'a milestone cannot be harvested twice'
);

select assert(
  public.tender_earned(:'alice') >= 25000,
  'streak bonuses count toward earned, which is what the Rich List ranks on'
);

-- A refund still must not count as earning.
select assert(
  public.tender_earned(:'bob') = (
    select coalesce(sum(amount), 0) from public.tender_entries
    where user_id = :'bob' and reason in ('reveal', 'solo', 'streak') and amount > 0
  ),
  'earned excludes refunds'
);

-- ---------------------------------------------------------------------------
-- The next-milestone nudge.
-- ---------------------------------------------------------------------------
select assert(
  (public.next_streak_milestone() ->> 'days')::int = 14,
  'the nudge points at the next unpaid milestone'
);
select assert(
  (public.next_streak_milestone() ->> 'to_go')::int = 6,
  'and says how far off it is'
);

-- ---------------------------------------------------------------------------
-- Prices at the new ceiling.
-- ---------------------------------------------------------------------------
select public.upsert_menu_item(null, 'A weekend entirely your way', 400000);
select assert(
  (select price from public.menu_items where title = 'A weekend entirely your way') = 400000,
  'an item can be priced right up to the ceiling'
);

do $$
begin
  perform public.upsert_menu_item(null, 'Beyond reach', 400001);
  raise exception 'FAILED: the ceiling is not enforced';
exception when sqlstate '22023' then
  raise notice 'ok — one past the ceiling is refused';
end $$;

\echo ''
\echo 'ALL RESCALE ASSERTIONS PASSED'
