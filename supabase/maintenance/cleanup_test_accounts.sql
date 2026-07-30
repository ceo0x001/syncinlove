-- ============================================================================
-- Remove ONLY the accounts created while diagnosing.
--
-- Run steps 1, 2 and 3 and READ them. Nothing is deleted until you uncomment
-- step 4. Real accounts must not appear in step 1.
--
-- Matched by name and address rather than by date, because a date range would
-- also catch whoever happened to sign up in the same window.
--
-- The safety that matters most is step 3. Deleting an account means deleting the
-- pairing it belongs to, because that is what clears the answers, reveals,
-- tender, menus, purchases and letters hanging off it. So a pairing is only
-- deleted when EVERY member of it is a test account. If a test account somehow
-- ended up paired with a real person, that pairing is left alone — losing a real
-- couple's history to tidy up after myself would be a far worse outcome than a
-- stray row left behind.
-- ============================================================================


-- ---- The definition of a test account, in one place ------------------------
-- A view so every step below matches on exactly the same rule. Dropped again in
-- step 5.
create or replace view public.v_test_accounts as
select u.id
from auth.users u
left join public.profiles p on p.id = u.id
where
  -- Names used only by the diagnostics in this session.
  p.first_name in ('Testy', 'Diagnostic', 'Diagtwo', 'Reproduce', 'Reprodwo', 'Verify')
  -- Addresses used only by those diagnostics, including the +tag probes.
  or u.email like '%@example.com'
  or u.email like 'crextmanuels+diag%'
  or u.email like 'crextmanuels+probe%'
  or u.email like 'crextmanuels+verify%'
  or u.email_change like '%@example.com'
  or u.email_change like 'crextmanuels+diag%'
  or u.email_change like 'crextmanuels+probe%'
  or u.email_change like 'crextmanuels+verify%'
  -- Anonymous shells with no profile at all: signups that never finished.
  or (p.id is null and u.is_anonymous);


-- ---- 1. What would go. Nothing is deleted by this. -------------------------
select
  u.id,
  p.first_name,
  u.email,
  u.email_change as pending_email,
  u.is_anonymous,
  u.created_at,
  (select count(*) from public.answers a where a.user_id = u.id) as answers,
  (select count(*) from public.reveals r
     where r.pair_id in (select pair_id from public.pair_members m where m.user_id = u.id)
  ) as reveals
from auth.users u
left join public.profiles p on p.id = u.id
where u.id in (select id from public.v_test_accounts)
order by u.created_at;


-- ---- 2. What survives. Run this too. --------------------------------------
select p.first_name, u.email, u.created_at
from auth.users u
join public.profiles p on p.id = u.id
where u.id not in (select id from public.v_test_accounts)
order by u.created_at;


-- ---- 3. THE SAFETY CHECK. This must return NO ROWS. -----------------------
--
-- Anything here is a pairing containing both a test account and a real one. If
-- this returns a row, STOP and tell me: the delete would take a real person's
-- history with it, and the right fix is to unpair, not to delete.
select
  pm.pair_id,
  string_agg(
    coalesce(p.first_name, '(no profile)') || ' <' || coalesce(u.email, 'none') || '>',
    ' + '
  ) as members
from public.pair_members pm
join auth.users u on u.id = pm.user_id
left join public.profiles p on p.id = pm.user_id
where pm.pair_id in (
  select pair_id from public.pair_members
  where user_id in (select id from public.v_test_accounts)
)
group by pm.pair_id
having bool_or(pm.user_id not in (select id from public.v_test_accounts));


-- ---- 4. ONLY once 1 and 2 look right AND 3 is empty. ----------------------
--
-- Uncomment this block to run it.

-- -- Pairings where every member is a test account. Cascades answers, reveals,
-- -- tender, menus, purchases, letters, invites and notifications.
-- delete from public.pairs
-- where id in (
--   select pm.pair_id
--   from public.pair_members pm
--   group by pm.pair_id
--   having bool_and(pm.user_id in (select id from public.v_test_accounts))
-- );
--
-- -- Then the accounts. Profiles go by cascade.
-- delete from auth.users where id in (select id from public.v_test_accounts);


-- ---- 5. After ------------------------------------------------------------
-- select
--   (select count(*) from auth.users)      as users,
--   (select count(*) from public.profiles) as profiles,
--   (select count(*) from public.pairs)    as pairs;
--
-- drop view if exists public.v_test_accounts;
