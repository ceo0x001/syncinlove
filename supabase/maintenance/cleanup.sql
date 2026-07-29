-- ============================================================================
-- Maintenance queries. Nothing here runs automatically — paste what you need.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. What's actually in there?
--
-- Run this first. Anonymous users with no profile are the residue of somebody
-- opening the app and leaving before typing a name, plus anything that probed
-- the signup endpoint.
-- ----------------------------------------------------------------------------

select
  (select count(*) from auth.users)                                    as auth_users,
  (select count(*) from auth.users where is_anonymous)                 as anonymous,
  (select count(*) from public.profiles)                               as profiles,
  (select count(*) from public.pairs)                                  as pairs,
  (select count(*) from public.pairs where status = 'pending')          as pairs_pending,
  (select count(*) from public.answers)                                as answers,
  (select count(*) from public.reveals)                                as reveals;

-- Every pair, with how many people are actually in it.
select
  p.id,
  p.status,
  p.time_zone,
  p.day_zero,
  p.created_at,
  (select count(*) from public.pair_members m where m.pair_id = p.id and m.left_at is null) as members,
  (select string_agg(pr.first_name, ' + ' order by pr.first_name)
     from public.pair_members m
     join public.profiles pr on pr.id = m.user_id
    where m.pair_id = p.id and m.left_at is null)                                           as who,
  (select count(*) from public.answers a where a.pair_id = p.id)                            as answers,
  (select count(*) from public.reveals r where r.pair_id = p.id)                            as reveals
from public.pairs p
order by p.created_at desc;


-- ----------------------------------------------------------------------------
-- 2. Sweep orphaned anonymous accounts
--
-- DESTRUCTIVE. Deletes anonymous users who never got as far as typing a name,
-- and are older than a day. These accumulate from bots, link previews, and
-- people who bounced off the first screen — they hold no content by definition,
-- because a profile is created in the same action as the name.
--
-- This is the Phase 5 hygiene job, run by hand until then. It deliberately does
-- NOT touch anonymous users who have a profile: an anonymous account with a
-- name and a streak is somebody's real account that simply hasn't attached an
-- email yet, and deleting it would destroy their history.
-- ----------------------------------------------------------------------------

-- Preview first.
select u.id, u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
where u.is_anonymous
  and p.id is null
  and u.created_at < now() - interval '1 day';

-- Then, if that list looks right:
-- delete from auth.users u
-- where u.is_anonymous
--   and not exists (select 1 from public.profiles p where p.id = u.id)
--   and u.created_at < now() - interval '1 day';


-- ----------------------------------------------------------------------------
-- 3. Drop abandoned empty pairs
--
-- DESTRUCTIVE. A pair with one member, no answers, and a week-old unclaimed
-- invite is a pairing that never happened. Cascades to its members and invites.
-- ----------------------------------------------------------------------------

-- Preview first.
select p.id, p.created_at
from public.pairs p
where p.status = 'pending'
  and (select count(*) from public.pair_members m where m.pair_id = p.id and m.left_at is null) <= 1
  and not exists (select 1 from public.answers a where a.pair_id = p.id)
  and p.created_at < now() - interval '7 days';

-- Then:
-- delete from public.pairs p
-- where p.status = 'pending'
--   and (select count(*) from public.pair_members m where m.pair_id = p.id and m.left_at is null) <= 1
--   and not exists (select 1 from public.answers a where a.pair_id = p.id)
--   and p.created_at < now() - interval '7 days';


-- ----------------------------------------------------------------------------
-- 4. Full reset
--
-- VERY DESTRUCTIVE — wipes every account, pairing, answer and reveal, leaving
-- only the question bank. Use this to clear out development and test data
-- before real people start using the app. There is no undo.
--
-- Uncomment to run.
-- ----------------------------------------------------------------------------

-- delete from auth.users;   -- cascades to profiles → pair_members → answers
-- delete from public.pairs; -- anything left behind by the cascade
--
-- select
--   (select count(*) from auth.users)      as auth_users,
--   (select count(*) from public.pairs)    as pairs,
--   (select count(*) from public.questions) as questions;  -- should still be 30
