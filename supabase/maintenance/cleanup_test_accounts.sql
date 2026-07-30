-- ============================================================================
-- Remove ONLY the accounts created while diagnosing.
--
-- Run the SELECT first and read it. It shows exactly what the DELETE would take,
-- so nothing is guessed at. Real accounts must not appear in that list.
--
-- Matched by name and address rather than by date, because a date range would
-- also catch whoever signed up in the same window.
-- ============================================================================

-- ---- 1. LOOK FIRST. Nothing is deleted by this. ----------------------------
with targets as (
  select u.id
  from auth.users u
  left join public.profiles p on p.id = u.id
  where
    -- Names used only by my diagnostics.
    p.first_name in ('Testy', 'Diagnostic', 'Diagtwo', 'Reproduce', 'Reprodwo', 'Verify')
    -- Addresses used only by my diagnostics, including the +tag probes.
    or u.email like '%@example.com'
    or u.email like 'crextmanuels+diag%'
    or u.email like 'crextmanuels+probe%'
    or u.email like 'crextmanuels+verify%'
    or u.email_change like '%@example.com'
    or u.email_change like 'crextmanuels+diag%'
    or u.email_change like 'crextmanuels+probe%'
    or u.email_change like 'crextmanuels+verify%'
    -- Anonymous shells with no profile at all: signups that never finished.
    or (p.id is null and u.is_anonymous)
)
select
  u.id,
  p.first_name,
  u.email,
  u.email_change   as pending_email,
  u.is_anonymous,
  u.created_at,
  (select count(*) from public.answers  a where a.user_id = u.id) as answers,
  (select count(*) from public.reveals  r
     where r.pair_id in (select pair_id from public.pair_members m where m.user_id = u.id)) as reveals
from auth.users u
left join public.profiles p on p.id = u.id
where u.id in (select id from targets)
order by u.created_at;


-- ---- 2. Sanity check: what survives? --------------------------------------
-- Run this too. These are the accounts the delete will NOT touch.
select p.first_name, u.email, u.created_at
from auth.users u
join public.profiles p on p.id = u.id
where p.first_name not in ('Testy', 'Diagnostic', 'Diagtwo', 'Reproduce', 'Reprodwo', 'Verify')
  and coalesce(u.email, '')        not like '%@example.com'
  and coalesce(u.email, '')        not like 'crextmanuels+diag%'
  and coalesce(u.email, '')        not like 'crextmanuels+probe%'
  and coalesce(u.email, '')        not like 'crextmanuels+verify%'
  and coalesce(u.email_change, '') not like '%@example.com'
order by u.created_at;


-- ---- 3. ONLY once both lists look right, delete. --------------------------
--
-- Order matters. Deleting the pairs first clears everything hanging off them —
-- answers, reveals, tender, menus, purchases, letters, invites, notifications —
-- and then deleting the users clears their profiles by cascade.
--
-- Uncomment the block below to run it.

-- with targets as (
--   select u.id
--   from auth.users u
--   left join public.profiles p on p.id = u.id
--   where p.first_name in ('Testy', 'Diagnostic', 'Diagtwo', 'Reproduce', 'Reprodwo', 'Verify')
--      or u.email like '%@example.com'
--      or u.email like 'crextmanuels+diag%'
--      or u.email like 'crextmanuels+probe%'
--      or u.email like 'crextmanuels+verify%'
--      or u.email_change like '%@example.com'
--      or u.email_change like 'crextmanuels+diag%'
--      or u.email_change like 'crextmanuels+probe%'
--      or u.email_change like 'crextmanuels+verify%'
--      or (p.id is null and u.is_anonymous)
-- )
-- delete from public.pairs
-- where id in (
--   select pair_id from public.pair_members where user_id in (select id from targets)
-- );
--
-- with targets as (
--   select u.id
--   from auth.users u
--   left join public.profiles p on p.id = u.id
--   where p.first_name in ('Testy', 'Diagnostic', 'Diagtwo', 'Reproduce', 'Reprodwo', 'Verify')
--      or u.email like '%@example.com'
--      or u.email like 'crextmanuels+diag%'
--      or u.email like 'crextmanuels+probe%'
--      or u.email like 'crextmanuels+verify%'
--      or u.email_change like '%@example.com'
--      or u.email_change like 'crextmanuels+diag%'
--      or u.email_change like 'crextmanuels+probe%'
--      or u.email_change like 'crextmanuels+verify%'
--      or (p.id is null and u.is_anonymous)
-- )
-- delete from auth.users where id in (select id from targets);


-- ---- 4. After ------------------------------------------------------------
-- select
--   (select count(*) from auth.users)      as users,
--   (select count(*) from public.profiles) as profiles,
--   (select count(*) from public.pairs)    as pairs;
