-- ============================================================================
-- Phase 5: the Rich List
--
-- The consent rules are the point of this suite. A public list of two first
-- names says publicly that two people are a couple, so "both opted in" is a
-- correctness property, not a preference — and one-sided consent silently
-- publishing somebody is the failure worth a permanent test.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

begin;

create or replace function pass(p_label text) returns void
language plpgsql as $$ begin raise notice 'ok   %', p_label; end $$;

create or replace function fail(p_label text, p_detail text) returns void
language plpgsql as $$ begin raise exception 'FAIL % — %', p_label, p_detail; end $$;

create or replace function eq(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    perform fail(p_label, format('got %s, wanted %s', p_got, p_want));
  end if;
  perform pass(p_label);
end $$;


-- ----------------------------------------------------------------------------
-- Fixtures: two couples, one rich, one less so.
-- ----------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('a0000000-0000-0000-0000-00000000000a', false),
  ('b0000000-0000-0000-0000-00000000000b', false),
  ('c0000000-0000-0000-0000-00000000000c', false),
  ('d0000000-0000-0000-0000-00000000000d', false);

insert into public.profiles (id, first_name, list_display, list_alias, list_opt_in) values
  ('a0000000-0000-0000-0000-00000000000a', 'Ada',  'name',    null,     false),
  ('b0000000-0000-0000-0000-00000000000b', 'Bo',   'initial', null,     false),
  ('c0000000-0000-0000-0000-00000000000c', 'Cleo', 'alias',   'Kestrel', false),
  ('d0000000-0000-0000-0000-00000000000d', 'Dev',  'name',    null,     false);

insert into public.pairs (id, time_zone, day_zero, status) values
  ('11110000-0000-0000-0000-000000000011', 'UTC', current_date - 10, 'active'),
  ('22220000-0000-0000-0000-000000000022', 'UTC', current_date - 10, 'active');

insert into public.pair_members (pair_id, user_id, role) values
  ('11110000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-00000000000a','inviter'),
  ('11110000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-00000000000b','invitee'),
  ('22220000-0000-0000-0000-000000000022','c0000000-0000-0000-0000-00000000000c','inviter'),
  ('22220000-0000-0000-0000-000000000022','d0000000-0000-0000-0000-00000000000d','invitee');

-- Earned: counts. 30k each for A+B, 10k each for C+D.
insert into public.tender_entries (pair_id, user_id, amount, reason, day_index) values
  ('11110000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-00000000000a', 30000,'reveal',0),
  ('11110000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-00000000000b', 30000,'reveal',0),
  ('22220000-0000-0000-0000-000000000022','c0000000-0000-0000-0000-00000000000c', 10000,'reveal',0),
  ('22220000-0000-0000-0000-000000000022','d0000000-0000-0000-0000-00000000000d', 10000,'reveal',0);

-- Not earned: a refund and a manual adjustment, deliberately enormous. If these
-- ever start counting, a couple can climb the list by passing tender back and
-- forth, which is the one thing the metric exists to prevent.
insert into public.tender_entries (pair_id, user_id, amount, reason) values
  ('22220000-0000-0000-0000-000000000022','c0000000-0000-0000-0000-00000000000c', 900000,'refund'),
  ('22220000-0000-0000-0000-000000000022','d0000000-0000-0000-0000-00000000000d', 900000,'adjustment');


-- ----------------------------------------------------------------------------
-- Consent
-- ----------------------------------------------------------------------------

select eq('nobody opted in: list is empty',
  (select count(*)::int from public.rich_list('all', 50)), 0);

update public.profiles set list_opt_in = true
  where id = 'a0000000-0000-0000-0000-00000000000a';

select eq('one partner opted in is NOT enough',
  (select count(*)::int from public.rich_list('all', 50)), 0);

update public.profiles set list_opt_in = true
  where id = 'b0000000-0000-0000-0000-00000000000b';

select eq('both opted in: the couple appears',
  (select count(*)::int from public.rich_list('all', 50)), 1);

update public.profiles set list_opt_in = false
  where id = 'b0000000-0000-0000-0000-00000000000b';

select eq('either one withdrawing removes the couple',
  (select count(*)::int from public.rich_list('all', 50)), 0);

update public.profiles set list_opt_in = true
  where id in ('b0000000-0000-0000-0000-00000000000b',
               'c0000000-0000-0000-0000-00000000000c',
               'd0000000-0000-0000-0000-00000000000d');


-- ----------------------------------------------------------------------------
-- What it ranks on
-- ----------------------------------------------------------------------------

select eq('ranks on earned, both wallets summed',
  (select earned from public.rich_list('all', 50) where rank = 1), 60000);

select eq('refunds and adjustments are not earnings',
  (select earned from public.rich_list('all', 50) where rank = 2), 20000);

select eq('richer couple ranks first',
  (select label_a from public.rich_list('all', 50) where rank = 1), 'Ada');


-- ----------------------------------------------------------------------------
-- How people are printed
-- ----------------------------------------------------------------------------

select eq('list_display = name prints the name',
  (select label_a from public.rich_list('all', 50) where rank = 1), 'Ada');

select eq('list_display = initial prints one letter',
  (select label_b from public.rich_list('all', 50) where rank = 1), 'B');

select eq('list_display = alias prints the alias, never the real name',
  (select label_a from public.rich_list('all', 50) where rank = 2), 'Kestrel');


-- ----------------------------------------------------------------------------
-- Who is eligible
-- ----------------------------------------------------------------------------

update public.pair_members set left_at = now()
  where user_id = 'b0000000-0000-0000-0000-00000000000b';
select eq('a half-empty pairing is not a couple',
  (select count(*)::int from public.rich_list('all', 50)), 1);
update public.pair_members set left_at = null
  where user_id = 'b0000000-0000-0000-0000-00000000000b';

update public.pairs set status = 'ended'
  where id = '11110000-0000-0000-0000-000000000011';
select eq('an ended pairing drops off',
  (select count(*)::int from public.rich_list('all', 50)), 1);
update public.pairs set status = 'active'
  where id = '11110000-0000-0000-0000-000000000011';


-- ----------------------------------------------------------------------------
-- The weekly window
-- ----------------------------------------------------------------------------

update public.tender_entries set created_at = now() - interval '30 days'
  where pair_id = '11110000-0000-0000-0000-000000000011';

select eq('all time still counts old earnings',
  (select count(*)::int from public.rich_list('all', 50)), 2);

select eq('the week only counts the last seven days',
  (select count(*)::int from public.rich_list('week', 50)), 1);

select eq('and the week ranks whoever earned in it',
  (select label_a from public.rich_list('week', 50) where rank = 1), 'Kestrel');


-- ----------------------------------------------------------------------------
-- Your own standing
-- ----------------------------------------------------------------------------

set sync.uid = 'a0000000-0000-0000-0000-00000000000a';

select eq('is_mine marks your row',
  (select is_mine from public.rich_list('all', 50) where rank = 1), true);

select eq('is_mine does not mark anybody else',
  (select is_mine from public.rich_list('all', 50) where rank = 2), false);

select eq('your standing is reported',
  (public.rich_list_me('all') ->> 'rank')::int, 1);

select eq('absent from the window reads as no rank, not rank zero',
  public.rich_list_me('week') ->> 'rank', null);

update public.profiles set list_opt_in = false
  where id = 'a0000000-0000-0000-0000-00000000000a';

select eq('opting out is distinguishable from having earned nothing',
  (public.rich_list_me('all') ->> 'opted_in')::boolean, false);

select eq('and it still reports the partner separately',
  (public.rich_list_me('all') ->> 'partner_opted_in')::boolean, true);

update public.profiles set list_opt_in = true
  where id = 'a0000000-0000-0000-0000-00000000000a';


-- ----------------------------------------------------------------------------
-- Leakage
--
-- rich_list_rows returns pair ids. Postgres grants EXECUTE to PUBLIC on every
-- new function, so revoking only the named roles leaves it reachable — this
-- asserts the PUBLIC grant is gone too.
-- ----------------------------------------------------------------------------

select eq('the internal rows function is not callable by signed-in users',
  has_function_privilege('authenticated', 'public.rich_list_rows(timestamptz)', 'execute'), false);

select eq('nor anonymously',
  has_function_privilege('anon', 'public.rich_list_rows(timestamptz)', 'execute'), false);

select eq('the public list is callable',
  has_function_privilege('authenticated', 'public.rich_list(text,int)', 'execute'), true);

select eq('and your own standing is callable',
  has_function_privilege('authenticated', 'public.rich_list_me(text)', 'execute'), true);

select eq('update_profile has exactly one signature, so PostgREST can resolve it',
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_profile'), 1);

-- ----------------------------------------------------------------------------
-- Reissuing an invite
--
-- The bug: invites were minted only inside create_pair, which returns early for
-- anybody who already has a pair. A partner who took longer than seven days left
-- the inviter permanently unable to produce another link.
-- ----------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('f1000000-0000-0000-0000-0000000000f1', false),
  ('f2000000-0000-0000-0000-0000000000f2', false);

set sync.uid = 'f1000000-0000-0000-0000-0000000000f1';
insert into public.profiles (id, first_name) values ('f1000000-0000-0000-0000-0000000000f1', 'Ann');
select public.create_pair('UTC', 'inv-a', 'non-a', now() + interval '7 days');

select eq('a new pairing starts with one live link',
  (select count(*)::int from public.invites
    where revoked_at is null and claimed_at is null), 1);

select public.reissue_invite('inv-b', 'non-b', now() + interval '7 days');

select eq('reissue revokes the previous link',
  (select count(*)::int from public.invites where revoked_at is not null), 1);

select eq('and leaves exactly one live',
  (select count(*)::int from public.invites
    where revoked_at is null and claimed_at is null), 1);

-- A second member makes it a real couple.
insert into public.profiles (id, first_name) values ('f2000000-0000-0000-0000-0000000000f2', 'Ben');
insert into public.pair_members (pair_id, user_id, role)
select id, 'f2000000-0000-0000-0000-0000000000f2', 'invitee'
from public.pairs
where id = public.current_pair_id();

do $$ begin
  perform public.reissue_invite('inv-c', 'non-c', now() + interval '7 days');
  perform fail('reissue on a claimed pairing', 'it was allowed');
exception when sqlstate '22023' then
  perform pass('a complete pairing cannot mint another link');
end $$;


-- ----------------------------------------------------------------------------
-- The public alias
--
-- The only free text this app shows to strangers, so a leaderboard must not be
-- able to display somebody's phone number.
-- ----------------------------------------------------------------------------

do $$ begin
  perform public.update_profile('Ann', 'alias', '08161234567');
  perform fail('digits-only alias', 'it was accepted');
exception when sqlstate '22023' then
  perform pass('an alias of digits alone is refused');
end $$;

do $$ begin
  perform public.update_profile('Ann', 'alias', 'this alias is far too long to fit');
  perform fail('over-long alias', 'it was accepted');
exception when sqlstate '22023' then
  perform pass('an over-long alias is refused');
end $$;

select public.update_profile('Ann', 'alias', 'Agent 99');
select eq('digits inside a real name are fine',
  (select list_alias from public.profiles where id = 'f1000000-0000-0000-0000-0000000000f1'),
  'Agent 99');


-- ---------------------------------------------------------------------------
-- What counts as earned
--
-- This decides a public ranking, so the distinction between the two hand-granted
-- reasons is worth a permanent test rather than a comment. 'restored' puts back
-- tender that was genuinely earned and then destroyed by a fault of ours, so it
-- ranks. 'adjustment' is a correction or a gift, so it does not.
--
-- Also guards the consolidation: "earned" lived in four functions by copy-paste and
-- two of them had already drifted, so tender_earned reported a smaller number than
-- the one the couple was ranked on. If any caller ever stops asking
-- tender_earning_reasons(), one of these two totals moves and the other does not.
-- ---------------------------------------------------------------------------

\set pa '11110000-0000-0000-0000-000000000011'

-- Both halves of pair A on the list, so it has a public standing to move.
update public.profiles set list_opt_in = true
where id in ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b');

select eq('a streak bonus counts toward earned, as the list already assumed',
  (select earned from public.rich_list_rows(null) where pair_id = :'pa'::uuid),
  60000);

insert into public.tender_entries (pair_id, user_id, amount, reason, detail)
values (:'pa', 'a0000000-0000-0000-0000-00000000000a', 5000, 'adjustment', '{}'::jsonb);

select eq('an adjustment is spendable but does NOT move the public ranking',
  (select earned from public.rich_list_rows(null) where pair_id = :'pa'::uuid),
  60000);

insert into public.tender_entries (pair_id, user_id, amount, reason, detail)
values (:'pa', 'a0000000-0000-0000-0000-00000000000a', 7000, 'restored', '{}'::jsonb);

select eq('restored tender DOES, because it was earned before we destroyed it',
  (select earned from public.rich_list_rows(null) where pair_id = :'pa'::uuid),
  67000);

-- Both reasons spend the same. Only provenance differs.
set sync.uid = 'a0000000-0000-0000-0000-00000000000a';
select eq('both land in the balance, so either can be spent on a partner',
  public.tender_balance(),
  (select sum(amount)::int from public.tender_entries
    where pair_id = :'pa'::uuid and user_id = 'a0000000-0000-0000-0000-00000000000a'));

select eq('and one person''s earned figure agrees with what the list ranks them on',
  public.tender_earned(),
  (select sum(t.amount)::int from public.tender_entries t
    where t.pair_id = :'pa'::uuid
      and t.user_id = 'a0000000-0000-0000-0000-00000000000a'
      and t.amount > 0
      and t.reason = any (public.tender_earning_reasons())));
reset role;

select eq('every caller reads the one definition',
  (select count(*)::int from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('tender_earned', 'rich_list_rows', 'rich_list_me', 'admin_economy')
     and pg_get_functiondef(p.oid) like '%tender_earning_reasons%'),
  4);

rollback;
