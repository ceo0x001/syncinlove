-- ============================================================================
-- Internal helpers stop answering the open internet
--
-- Found while adding tender milestones, by calling the deployed functions with the anon
-- key and reading the status codes. Eight SECURITY DEFINER functions answered. Three of
-- them write.
--
--   pay_out_reveal(uuid, int)           204 — writes tender entries
--   award_streak_milestones(uuid)       200 — writes tender entries
--   settle_freezes(uuid)                200 — writes streak_freezes
--   pair_streak(uuid)                   200
--   pair_today(uuid)                    200
--   freezes_left(uuid, date)            200
--   tender_balance(uuid)                200
--   tender_earned(uuid)                 200
--
-- WHY THEY WERE OPEN
--
-- Nobody granted them. Supabase's project-level default privileges grant EXECUTE on new
-- functions in `public` to `anon` BY NAME, so a function with no grants of its own is
-- reachable by anyone holding the anon key — which is in the browser bundle, by design.
-- The same trap as 0024, which is recorded in this repo's notes and still caught eight
-- more functions, because a note about a mistake does not fix the instances of it.
--
-- HOW BAD
--
-- Today: not very, and that is luck rather than design. The three writers are all
-- idempotent — `on conflict do nothing` throughout — and pay_out_reveal only pays for a
-- day that already has a reveal, which by construction has already been paid. The
-- readers need a v4 UUID guessed. tender_balance and tender_earned scope themselves with
-- current_pair_id(), which is null for anon, so they return 0 rather than somebody's
-- money.
--
-- Tomorrow: a money-touching, write-capable, SECURITY DEFINER function reachable by
-- anonymous internet traffic is one refactor away from being serious, and the refactor
-- would not know it had to preserve idempotency to stay safe.
--
-- WHAT THIS DOES AND DELIBERATELY DOES NOT DO
--
-- Closes anon on all eight. Also closes authenticated on the three that no caller in the
-- app uses and that exist only to be called from inside other definer functions —
-- internal calls run as the owner and are unaffected.
--
-- It does NOT touch the deliberate `grant ... to authenticated` on pair_today,
-- freezes_left, tender_balance and tender_earned. Those were chosen in 0019, 0020 and
-- 0021, and quietly reversing somebody's decision inside a lockdown is how a security fix
-- becomes an outage.
--
-- It also does not add membership checks. pair_streak, pair_today and freezes_left take a
-- pair_id and never ask whether the caller belongs to that pairing, so a signed-in person
-- who knows another couple's UUID can still read their streak. That is a real gap, it is
-- narrower than this one, and it is a behaviour change rather than a privilege change —
-- so it belongs in its own migration with its own tests, not bundled in here.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The three writers: nothing outside the database calls these
-- ----------------------------------------------------------------------------

revoke all on function public.pay_out_reveal(uuid, int) from anon, authenticated, public;
revoke all on function public.award_streak_milestones(uuid) from anon, authenticated, public;
revoke all on function public.settle_freezes(uuid) from anon, authenticated, public;


-- ----------------------------------------------------------------------------
-- The readers: anon loses it, authenticated keeps what was deliberately granted
-- ----------------------------------------------------------------------------

revoke all on function public.pair_streak(uuid) from anon, public;
revoke all on function public.pair_today(uuid) from anon, public;
revoke all on function public.freezes_left(uuid, date) from anon, public;
revoke all on function public.tender_balance(uuid) from anon, public;
revoke all on function public.tender_earned(uuid) from anon, public;

-- Restated rather than assumed: a revoke from `public` can take a grant with it if the
-- named role never had one of its own, and silently removing these would break the
-- dashboard.
grant execute on function public.pair_today(uuid) to authenticated;
grant execute on function public.freezes_left(uuid, date) to authenticated;
grant execute on function public.tender_balance(uuid) to authenticated;
grant execute on function public.tender_earned(uuid) to authenticated;

-- pair_streak has no app caller and no prior deliberate grant, so it stays internal.
