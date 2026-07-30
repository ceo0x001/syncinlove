-- ============================================================================
-- The admin dashboard.
--
-- Two properties this suite exists to defend.
--
-- Nobody who is not an admin can call any of it. Every function reads across
-- every account in the database, so the gate is the entire security story — and
-- because these are SECURITY DEFINER, a missing require_admin() would not fail
-- loudly, it would quietly hand a stranger the user table.
--
-- And no admin function returns content. Not answers, not menu titles, not
-- letter bodies. Users are told "neither of you sees anything until you both
-- have" and "only you write this"; an admin able to read those would make both
-- untrue while nobody knew. That is asserted against the function signatures
-- rather than trusted, so adding a content column to one later breaks a test.
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

\set boss  'aa000000-0000-0000-0000-0000000000aa'
\set alice 'bb000000-0000-0000-0000-0000000000bb'
\set bob   'cc000000-0000-0000-0000-0000000000cc'
\set solo  'dd000000-0000-0000-0000-0000000000dd'

insert into auth.users (id, email, is_anonymous) values
  (:'boss',  'me@emmanuelemenike.com', false),
  (:'alice', 'alice@example.com',      false),
  (:'bob',   'bob@example.com',        false),
  (:'solo',  'solo@example.com',       false);

insert into public.profiles (id, first_name) values
  (:'boss', 'Boss'), (:'alice', 'Alice'), (:'bob', 'Bob'), (:'solo', 'Solo');

-- Alice + Bob are a real couple. Solo is alone in their own pairing.
insert into public.pairs (id, time_zone, day_zero, status) values
  ('a1110000-0000-0000-0000-00000000a111', 'UTC', current_date - 3, 'active'),
  ('b2220000-0000-0000-0000-00000000b222', 'UTC', current_date, 'pending');

insert into public.pair_members (pair_id, user_id, role) values
  ('a1110000-0000-0000-0000-00000000a111', :'alice', 'inviter'),
  ('a1110000-0000-0000-0000-00000000a111', :'bob',   'invitee'),
  ('b2220000-0000-0000-0000-00000000b222', :'solo',  'inviter');

insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
select 'a1110000-0000-0000-0000-00000000a111', d,
       (select id from public.questions limit 1), 70, '{}'::jsonb
from generate_series(0, 2) d;

insert into public.admins (user_id, note) values (:'boss', 'test admin');


-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------

set sync.uid = 'bb000000-0000-0000-0000-0000000000bb';   -- Alice, an ordinary user

select assert(public.is_admin() is false, 'an ordinary user is not an admin');

do $$ begin
  perform public.admin_overview();
  raise exception 'FAILED: a non-admin read the overview';
exception when sqlstate '42501' then
  raise notice 'ok — a non-admin cannot read the overview';
end $$;

do $$ begin
  perform public.admin_accounts(null, 10);
  raise exception 'FAILED: a non-admin listed accounts';
exception when sqlstate '42501' then
  raise notice 'ok — a non-admin cannot list accounts';
end $$;

do $$ begin
  perform public.admin_economy();
  raise exception 'FAILED: a non-admin read the economy';
exception when sqlstate '42501' then
  raise notice 'ok — a non-admin cannot read the economy';
end $$;

do $$ begin
  perform public.admin_nudges();
  raise exception 'FAILED: a non-admin read nudge health';
exception when sqlstate '42501' then
  raise notice 'ok — a non-admin cannot read nudge health';
end $$;

do $$ begin
  perform count(*) from public.admin_retention();
  raise exception 'FAILED: a non-admin read retention';
exception when sqlstate '42501' then
  raise notice 'ok — a non-admin cannot read retention';
end $$;

do $$ begin
  perform public.admin_delete_account('cc000000-0000-0000-0000-0000000000cc');
  raise exception 'FAILED: a non-admin deleted an account';
exception when sqlstate '42501' then
  raise notice 'ok — a non-admin cannot delete an account';
end $$;

do $$ begin
  perform public.admin_set_admin('bb000000-0000-0000-0000-0000000000bb', true);
  raise exception 'FAILED: a non-admin promoted themselves';
exception when sqlstate '42501' then
  raise notice 'ok — a non-admin cannot promote themselves';
end $$;

-- The table itself, not just the functions.
select assert(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'admins') = 0,
  'the admins table has no RLS policies, so there is no API write path to it'
);
select assert(
  has_table_privilege('authenticated', 'public.admins', 'insert') is false,
  'authenticated cannot insert an admin grant'
);
select assert(
  has_table_privilege('anon', 'public.admins', 'select') is false,
  'anon cannot even read who the admins are'
);

-- Signed out entirely.
set sync.uid = '';
do $$ begin
  perform public.admin_overview();
  raise exception 'FAILED: an anonymous caller read the overview';
exception when sqlstate '28000' then
  raise notice 'ok — a signed-out caller is refused before anything else';
end $$;


-- ---------------------------------------------------------------------------
-- What an admin actually gets
-- ---------------------------------------------------------------------------

set sync.uid = 'aa000000-0000-0000-0000-0000000000aa';   -- the admin

select assert(public.is_admin(), 'the admin is recognised');

select assert(
  (public.admin_overview() ->> 'users')::int = 4,
  'the overview counts every account'
);
select assert(
  (public.admin_overview() ->> 'pairs_complete')::int = 1,
  'and counts only genuinely two-person pairings as complete'
);
select assert(
  (public.admin_overview() ->> 'reveals_total')::int = 3,
  'and counts reveals'
);

select assert(
  (select pairs from public.admin_retention() where milestone = 3) = 1,
  'retention sees the pair that reached three days'
);
select assert(
  (select pairs from public.admin_retention() where milestone = 7) = 0,
  'and not one that has not'
);

select assert(
  (select count(*) from public.admin_accounts(null, 100)) = 4,
  'the account list returns everybody'
);
select assert(
  (select first_name from public.admin_accounts('alice', 10)) = 'Alice',
  'and searching by email finds the right person'
);
select assert(
  (select partner_name from public.admin_accounts('alice', 10)) = 'Bob',
  'and names who they are actually paired with'
);
select assert(
  (select partner_email from public.admin_accounts('alice', 10)) = 'bob@example.com',
  'with an address, so a support request can be matched to a person'
);
select assert(
  (select completed_days from public.admin_accounts('alice', 10)) = 3,
  'and how many days they have completed'
);
select assert(
  (select is_admin from public.admin_accounts('me@emmanuel', 10)),
  'and marks which accounts are admins'
);


-- ---------------------------------------------------------------------------
-- No content, asserted against the signatures
--
-- If somebody later adds a column exposing what people wrote, this fails.
-- ---------------------------------------------------------------------------

select assert(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'admin_%'
      and (
        lower(pg_get_function_result(p.oid)) like '%self_payload%'
        or lower(pg_get_function_result(p.oid)) like '%guess_payload%'
        or lower(pg_get_function_result(p.oid)) like '%payload%'
        or lower(pg_get_function_result(p.oid)) like '%body%'
        or lower(pg_get_function_result(p.oid)) like '%title%'
        or lower(pg_get_function_result(p.oid)) like '%prompt%'
      )
  ),
  'no admin function returns a content column'
);


-- ---------------------------------------------------------------------------
-- Deleting, and the guard that matters
-- ---------------------------------------------------------------------------

-- Bob is half of a real couple. Deleting Bob must NOT take Alice's history.
select public.admin_delete_account(:'bob');

select assert(
  (select count(*) from auth.users where id = :'bob') = 0,
  'the account is gone'
);
select assert(
  (select count(*) from public.pairs where id = 'a1110000-0000-0000-0000-00000000a111') = 1,
  'but the pairing survives, because somebody real was still in it'
);
select assert(
  (select count(*) from public.reveals
     where pair_id = 'a1110000-0000-0000-0000-00000000a111') = 3,
  'and the remaining partner keeps every reveal'
);
select assert(
  (select left_at is not null from public.pair_members
     where pair_id = 'a1110000-0000-0000-0000-00000000a111' and user_id = :'bob') is null,
  'the removed membership row goes with the account'
);

-- Solo is alone. Deleting Solo should take the empty pairing with them.
select public.admin_delete_account(:'solo');
select assert(
  (select count(*) from public.pairs where id = 'b2220000-0000-0000-0000-00000000b222') = 0,
  'a pairing with nobody left in it is removed too'
);

-- An admin cannot delete themselves from here.
do $$ begin
  perform public.admin_delete_account('aa000000-0000-0000-0000-0000000000aa');
  raise exception 'FAILED: an admin deleted their own account';
exception when sqlstate '22023' then
  raise notice 'ok — an admin cannot delete their own account from the panel';
end $$;


-- ---------------------------------------------------------------------------
-- Granting, and not locking yourself out
-- ---------------------------------------------------------------------------

select public.admin_set_admin(:'alice', true);
select assert(
  (select count(*) from public.admins) = 2,
  'an admin can promote somebody'
);

select public.admin_set_admin(:'alice', false);
select assert(
  (select count(*) from public.admins) = 1,
  'and demote them again'
);

do $$ begin
  perform public.admin_set_admin('aa000000-0000-0000-0000-0000000000aa', false);
  raise exception 'FAILED: the last admin demoted themselves';
exception when sqlstate '22023' then
  raise notice 'ok — the last admin cannot be removed, so nobody gets locked out';
end $$;


-- ---------------------------------------------------------------------------
-- Suspension
--
-- Enforced by trigger rather than by editing each write function, so what
-- matters is that EVERY write path is closed and every read path stays open.
-- A suspension that blocks three of four writes is not a suspension, and one
-- that also blocks reading would be confiscating what somebody already wrote.
-- ---------------------------------------------------------------------------

set sync.uid = 'aa000000-0000-0000-0000-0000000000aa';
select public.admin_set_suspended(:'alice', true, 'testing');

select assert(
  (select suspended_at is not null from public.profiles where id = :'alice'),
  'an admin can suspend somebody'
);

set sync.uid = 'bb000000-0000-0000-0000-0000000000bb';   -- Alice, now suspended

select assert(
  (public.my_suspension() ->> 'suspended')::boolean,
  'and the app can tell them so'
);
select assert(
  public.my_suspension() ->> 'reason' = 'testing',
  'with the reason given'
);

do $$ begin
  insert into public.answers (pair_id, day_index, question_id, user_id, self_payload, guess_payload)
  values ('a1110000-0000-0000-0000-00000000a111', 90,
          (select id from public.questions limit 1),
          'bb000000-0000-0000-0000-0000000000bb', '{}', '{}');
  raise exception 'FAILED: a suspended account answered a question';
exception when sqlstate '42501' then
  raise notice 'ok — a suspended account cannot answer';
end $$;

do $$ begin
  insert into public.menu_items (pair_id, owner_id, title, price)
  values ('a1110000-0000-0000-0000-00000000a111',
          'bb000000-0000-0000-0000-0000000000bb', 'something', 1000);
  raise exception 'FAILED: a suspended account wrote a menu item';
exception when sqlstate '42501' then
  raise notice 'ok — a suspended account cannot write a menu';
end $$;

-- Reading their own history must still work. Suspension stops somebody; it does
-- not confiscate what they already wrote.
select assert(
  (select count(*) from public.reveals
     where pair_id = 'a1110000-0000-0000-0000-00000000a111') = 3,
  'but they can still read their own history'
);

-- The consequences that follow from suspension rather than being separate switches.
select assert(
  (select count(*) from public.nudge_queue(0)
     where user_id = 'bb000000-0000-0000-0000-0000000000bb') = 0,
  'a suspended account is never nudged'
);

set sync.uid = 'aa000000-0000-0000-0000-0000000000aa';
select public.admin_set_suspended(:'alice', false);
select assert(
  (select suspended_at is null from public.profiles where id = :'alice'),
  'and lifting it puts everything back'
);

do $$ begin
  perform public.admin_set_suspended('aa000000-0000-0000-0000-0000000000aa', true);
  raise exception 'FAILED: an admin suspended themselves';
exception when sqlstate '22023' then
  raise notice 'ok — an admin cannot suspend their own account';
end $$;

set sync.uid = 'bb000000-0000-0000-0000-0000000000bb';
do $$ begin
  perform public.admin_set_suspended('aa000000-0000-0000-0000-0000000000aa', true);
  raise exception 'FAILED: a non-admin suspended somebody';
exception when sqlstate '42501' then
  raise notice 'ok — a non-admin cannot suspend anybody';
end $$;


-- ---------------------------------------------------------------------------
-- The pairing is visible, which is what an operator needs for support
-- ---------------------------------------------------------------------------

set sync.uid = 'aa000000-0000-0000-0000-0000000000aa';

select assert(
  (select partner_name from public.admin_accounts('alice', 10)) is not null
  or (select pair_id from public.admin_accounts('alice', 10)) is not null,
  'the account list shows the pairing, not just whether one exists'
);

rollback;
