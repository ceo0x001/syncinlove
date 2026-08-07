-- ============================================================================
-- Remove the rotation nothing walks any more
--
-- 0023 pointed submit_answer at question_for_pair_day, and the TypeScript readers moved
-- in the same deploy. Since then question_for_day(int) has had no callers and
-- questions.sequence_position has had no readers — the ordering lives in
-- question_order, one row per pace, and what a couple was actually asked lives in
-- pair_days.
--
-- Deferred deliberately across 0023 and 0024 so a revert had one thing to unpick rather
-- than two. That reason is gone: the flip has been live, a real couple has submitted,
-- revealed and been paid through the new path.
--
-- WHY BOTHER REMOVING IT
--
-- Because it was not inert, it was misleading. question_for_day is still granted to
-- authenticated and anon, so it reads like a supported way to ask what today's question
-- is — and it would answer, with the wrong question, from an ordering nobody uses. The
-- same was true one level up: the TypeScript tests asserting what the old ramp
-- guaranteed stayed green the whole time the spiral was live, describing a rotation
-- nobody walked. Dead code that still answers is worse than dead code that does not.
--
-- ORDER MATTERS
--
-- The function reads the column, so the function goes first. Postgres would refuse the
-- other way round, which is a good error to never see.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The function
--
-- Both definitions — 0001's and the renewable-aware rewrite in 0002 — are the same
-- signature, so one drop removes it.
-- ----------------------------------------------------------------------------

drop function if exists public.question_for_day(int);


-- ----------------------------------------------------------------------------
-- The column
--
-- Nothing reads it. Its unique index goes with it, which also removes the reason the
-- seed file used to null the whole column before reinserting: a reorder could
-- transiently collide on sequence_position, and question_order has no such problem
-- because it is deleted and rewritten wholesale inside one transaction.
--
-- Irreversible in the sense that matters: the values are derivable again from
-- `npm run seed:questions` at any commit that still had them, and nothing in
-- answers, reveals or pair_days depends on them. Those tables all reference
-- questions.id, which is untouched.
-- ----------------------------------------------------------------------------

alter table public.questions drop column if exists sequence_position;
