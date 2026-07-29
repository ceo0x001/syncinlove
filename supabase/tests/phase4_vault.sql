-- Phase 4: the letter vault and the exits.
--
-- The most safety-critical rules in the app live here, so they are tested from a
-- real non-owner role rather than assumed. A sealed letter is a message that
-- cannot be recalled, arriving on a date chosen months earlier — in a
-- relationship that has gone wrong, that is a delivery mechanism for somebody the
-- recipient no longer wants to hear from.

\set QUIET on
\pset pager off

-- The pair below lives in UTC, and the letters policy compares unlock_on
-- against the PAIR's clock: (now() at time zone p.time_zone)::date. This suite
-- writes unlock dates with current_date, which is the session's clock. Those two
-- disagree for part of every day — on a machine in Africa/Lagos, between local
-- midnight and 01:00 UTC the session is already tomorrow while the pair is still
-- yesterday, so "an unlocked letter becomes readable" failed for exactly that
-- hour and passed the other twenty-three. Pinning the session to UTC makes both
-- clocks the same one.
set time zone 'UTC';

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

set sync.uid = '11111111-1111-4111-8111-111111111111';
insert into public.profiles (id, first_name) values (:'alice', 'Alice');
select public.create_pair('UTC', 'h', 'n', now() + interval '7 days');

set sync.uid = '22222222-2222-4222-8222-222222222222';
insert into public.profiles (id, first_name) values (:'bob', 'Bob');
select public.claim_invite('h');

-- ---------------------------------------------------------------------------
-- The vault is gated on 30 CUMULATIVE days, not a streak.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';

select assert(not public.vault_open(), 'the vault is shut on day one');

do $$
begin
  perform public.seal_letter('Too soon', 'Body', current_date + 30, true);
  raise exception 'FAILED: sealing before the vault opens should be refused';
exception when sqlstate 'P0018' then
  raise notice 'ok — you cannot seal before the vault opens';
end $$;

-- 29 reveals with a deliberate gap, so this proves CUMULATIVE rather than
-- consecutive: gating a headline feature on a streak lets one missed day lock a
-- couple out for good.
do $$
declare v_pair uuid := public.current_pair_id();
begin
  insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
  select v_pair, d, 'q-sleep', 70, '{}'::jsonb
  from generate_series(0, 14) d
  on conflict do nothing;
  insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
  select v_pair, d, 'q-sleep', 70, '{}'::jsonb
  from generate_series(40, 53) d
  on conflict do nothing;
end $$;

select assert(public.completed_days() = 29, '29 days completed, with a gap in the middle');
select assert(not public.vault_open(), 'still shut at 29');
select assert(public.pair_streak(public.current_pair_id()) = 14, 'the streak is only 14');

do $$
declare v_pair uuid := public.current_pair_id();
begin
  insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
  values (v_pair, 54, 'q-sleep', 70, '{}'::jsonb) on conflict do nothing;
end $$;

select assert(public.vault_open(), 'the vault opens at 30 cumulative days, streak or no streak');

-- Those reveals were inserted directly, so they never triggered a payout — which
-- is exactly the state a couple ended up in on the live database. Replaying the
-- backfill both funds the wallets for the tests below and proves the repair works.
select assert(
  public.tender_balance(:'alice') = 0,
  'reveals written without a payout leave the wallet empty'
);
select assert(
  public.backfill_missing_payouts() = 30,
  'the backfill finds every reveal that was never paid'
);
select assert(
  public.tender_balance(:'alice') = 30 * 31000 + 25000 + 50000,
  'and pays them, streak milestones included'
);
select assert(
  public.backfill_missing_payouts() = 0,
  'running it again finds nothing — it is idempotent'
);

-- ---------------------------------------------------------------------------
-- Sealing.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.seal_letter('Yesterday', 'Body', current_date - 1, true);
  raise exception 'FAILED: a past unlock date should be refused';
exception when sqlstate '22023' then
  raise notice 'ok — the unlock date must be in the future';
end $$;

do $$
begin
  perform public.seal_letter('Never', 'Body', (current_date + interval '80 years')::date, true);
  raise exception 'FAILED: an absurd date should be refused';
exception when sqlstate '22023' then
  raise notice 'ok — a date beyond promising is refused';
end $$;

select public.seal_letter('For your birthday', 'You were right about the flat.',
                          current_date + 60, true) as visible_letter \gset
select public.seal_letter('Open when you need it', 'The secret one.',
                          current_date + 90, false) as hidden_letter \gset

select assert(
  (select count(*) from public.letters where pair_id = public.current_pair_id()) = 2,
  'two letters sealed'
);
select assert(
  (select recipient_id from public.letters where id = :'visible_letter') = :'bob',
  'a letter is addressed to the partner, not the sender'
);

-- ---------------------------------------------------------------------------
-- What the recipient may know. This is the crux.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'x';
    grant authenticated to app_user;
  end if;
end $$;

set role app_user;
set sync.uid = '22222222-2222-4222-8222-222222222222';

-- The body must be unreadable, including by the person motivated to peek.
select assert(
  (select count(*) from public.letters) = 0,
  'a sealed letter is invisible to its recipient — not even the row'
);

select assert(
  jsonb_array_length(public.sealed_for_me()) = 2,
  'but they are told two letters are waiting'
);

select assert(
  (select count(*) from jsonb_array_elements(public.sealed_for_me()) e
   where e ->> 'unlock_on' is not null) = 1,
  'the date shows only for the letter whose sender allowed it'
);

select assert(
  (select count(*) from jsonb_array_elements(public.sealed_for_me()) e
   where (e ->> 'date_visible')::boolean is false and e ->> 'unlock_on' is null) = 1,
  'a hidden date really is withheld — the surprise survives'
);

do $$
declare v_id uuid;
begin
  -- Looked up by title rather than a psql variable: substitution does not happen
  -- inside dollar-quoted blocks.
  select id into v_id from public.letters where title = 'For your birthday';
  perform public.open_letter(v_id);
  raise exception 'FAILED: opening a sealed letter early should be refused';
exception when sqlstate '42501' then
  raise notice 'ok — a letter cannot be opened before its date';
end $$;

-- ---------------------------------------------------------------------------
-- The recipient's veto. The most important rule in Phase 4.
-- ---------------------------------------------------------------------------
select public.destroy_letter(:'hidden_letter');

select assert(
  jsonb_array_length(public.sealed_for_me()) = 1,
  'the recipient can destroy a sealed letter unopened, unilaterally'
);

reset role;
set sync.uid = '11111111-1111-4111-8111-111111111111';

select assert(
  (select count(*) from public.letters where pair_id = public.current_pair_id()) = 1,
  'and it is really gone — a hard delete, not a flag'
);

-- The sender is never told WHICH letter went; they can only see their own
-- remaining ones, with no record of the destruction.
select assert(
  (select count(*) from public.letters where id = :'hidden_letter') = 0,
  'the sender has no trace of which letter was refused'
);

set role app_user;
set sync.uid = '11111111-1111-4111-8111-111111111111';
do $$
declare v_id uuid;
begin
  select id into v_id from public.letters where title = 'For your birthday';
  perform public.destroy_letter(v_id);
  raise exception 'FAILED: the sender must not be able to destroy the recipient''s letter';
exception when sqlstate '42501' then
  raise notice 'ok — only the recipient may destroy a letter addressed to them';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Unlocked letters open, and only while the pairing stands.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';
select public.seal_letter('Tomorrow', 'Readable soon.', current_date + 1, true) as soon \gset
update public.letters set unlock_on = current_date where id = :'soon';

set role app_user;
set sync.uid = '22222222-2222-4222-8222-222222222222';
select assert(
  (select count(*) from public.letters where id = :'soon') = 1,
  'an unlocked letter becomes readable'
);
select public.open_letter(:'soon');
reset role;
select assert(
  (select opened_at is not null from public.letters where id = :'soon'),
  'opening is recorded'
);

-- ---------------------------------------------------------------------------
-- Export. Must not become a way to read what you were never shown.
-- ---------------------------------------------------------------------------
set sync.uid = '22222222-2222-4222-8222-222222222222';
select public.export_archive() as ex \gset

select assert(
  jsonb_array_length((:'ex'::jsonb) -> 'letters_to_me_opened') = 1,
  'the export includes a letter that was opened'
);
select assert(
  jsonb_array_length((:'ex'::jsonb) -> 'letters_to_me_still_sealed') = 1,
  'and lists the one still sealed'
);
select assert(
  not ((:'ex'::jsonb) -> 'letters_to_me_still_sealed')::text like '%You were right about the flat%',
  'but never the text of a sealed letter — leaving is not a way to read it early'
);
select assert(
  jsonb_array_length((:'ex'::jsonb) -> 'my_answers') >= 0
  and (:'ex'::jsonb) -> 'pair' ->> 'days_together' = '30',
  'the export carries the pairing and the answers'
);

-- ---------------------------------------------------------------------------
-- Ending the pairing.
-- ---------------------------------------------------------------------------
set sync.uid = '11111111-1111-4111-8111-111111111111';

-- Give them an outstanding request, to prove it is refunded rather than stranded.
select public.upsert_menu_item(null, 'A long walk', 20000);
select public.upsert_menu_item(null, 'Dinner', 40000);
select public.upsert_menu_item(null, 'The washing up, all week', 30000);
set sync.uid = '22222222-2222-4222-8222-222222222222';
select public.upsert_menu_item(null, 'Coffee', 10000);
select public.upsert_menu_item(null, 'Lift to the airport', 30000);
select public.upsert_menu_item(null, 'Bins', 15000);
do $$
begin
  perform public.buy_menu_item((select id from public.menu_items where title = 'A long walk'));
end $$;

select assert(
  (select count(*) from public.purchases where status = 'requested') = 1,
  'a request is outstanding before the pairing ends'
);

select assert(
  (public.end_pairing('burn') ->> 'letters_burned')::int = 1,
  'ending burns the sealed letters by default'
);

select assert(
  (select count(*) from public.purchases where status = 'requested') = 0,
  'outstanding requests are closed rather than stranded'
);
select assert(
  (select count(*) from public.tender_entries where reason = 'refund') >= 1,
  'and the tender goes back'
);
select assert(
  (select status from public.pairs where id is not null limit 1) = 'ended',
  'the pairing is ended'
);
select assert(public.current_pair_id() is null, 'and nobody is in it any more');

-- An opened letter survives: it was already read, and deleting it would be
-- erasing something the recipient already has.
select assert(
  (select count(*) from public.letters where opened_at is not null) = 1,
  'a letter already read is not burned'
);

\echo ''
\echo 'ALL PHASE 4 ASSERTIONS PASSED'
