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
-- sync 90 -> payout 15 + round(45*0.9)=41 -> 56
select assert(
  (select sync_score from public.reveals where day_index = 0) = 90,
  'day 0 scores 90'
);

select assert(public.tender_payout_for_score(90) = 56, 'a 90 pays 56');
select assert(public.tender_payout_for_score(0) = 15,  'a zero day still pays the completion floor');
select assert(public.tender_payout_for_score(100) = 60, 'a perfect day pays exactly the cap');

select assert(
  public.tender_balance(:'alice') = 56 and public.tender_balance(:'bob') = 56,
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
select assert(public.tender_balance(:'alice') = 56, 'a repeat submission does not pay twice');

do $$
begin
  perform public.pay_out_reveal(public.current_pair_id(), 0);
  perform public.pay_out_reveal(public.current_pair_id(), 0);
end $$;
select assert(public.tender_balance(:'alice') = 56, 'pay_out_reveal is idempotent');

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
select assert(
  (select count(*) from public.questions where sequence_position is not null) = 60,
  'the bank holds 60 questions'
);
select assert((public.question_for_day(0)).id = 'q-sleep', 'day 0 is the gentle opener');
select assert(
  (select count(*) from generate_series(60, 200) d
   where not (public.question_for_day(d)).renewable) = 0,
  'nothing non-renewable is ever recycled'
);
select assert(
  (public.question_for_day(60)).id <> (public.question_for_day(0)).id
  or (public.question_for_day(0)).renewable,
  'the wrap lands on a renewable question'
);

-- ---------------------------------------------------------------------------
-- Menus. Own only.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';
select public.upsert_menu_item(null, 'Back rub', 40);
select public.upsert_menu_item(null, 'I handle dinner all week', 150);
select public.upsert_menu_item(null, 'You pick the film, no complaints', 25);

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
  perform public.upsert_menu_item(null, 'Absurd', 5000);
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
  perform public.upsert_menu_item(v_item, 'Back rub', 90);
end $$;
select assert(
  (select count(*) from public.menu_price_changes where old_price = 40 and new_price = 90) = 1,
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

select public.upsert_menu_item(null, 'Coffee in bed', 20);
select public.upsert_menu_item(null, 'Airport run', 120);
select public.upsert_menu_item(null, 'I deal with the bins all month', 60);

-- Back rub was repriced to 90 above; bob holds 56.
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

select assert(public.tender_balance(:'bob') = 56, 'a failed purchase moves no money');

-- Buy something affordable.
do $$
begin
  perform public.buy_menu_item(
    (select id from public.menu_items where title = 'You pick the film, no complaints')
  );
end $$;

select assert(public.tender_balance(:'bob') = 56 - 25, 'buying debits the buyer');
select assert(public.tender_balance(:'alice') = 56, 'buying does not credit the seller');
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
select assert(public.tender_balance(:'bob') = 31, 'fulfilment moves no further money');

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
select assert(public.tender_balance(:'bob') = 31, 'declining refunds in full');
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
  public.tender_earned(:'bob') = 56,
  'earned counts payouts only — spending does not reduce it'
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
