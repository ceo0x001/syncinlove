-- ============================================================================
-- Date every milestone from when it actually happened
--
-- award_tender_marks runs on each reveal, so a couple already past a rung when 0029
-- landed would have it recorded with reached_at set to their NEXT reveal rather than to
-- the day they crossed. There is at least one such couple — the first millionaires — and
-- a milestone whose date is a lie about when it was reached is a worse artefact than no
-- milestone at all. It is the thing you would screenshot.
--
-- The ledger knows. Every earning entry carries created_at, so running the sum forward in
-- time gives the exact entry that pushed a total over each threshold, and that entry's
-- timestamp is the answer.
--
-- Ordered by created_at then id. The id tiebreak matters rather than being defensive: a
-- reveal credits both partners inside one transaction, so two entries can share a
-- timestamp to the microsecond, and without a stable second key the running total would
-- be non-deterministic across runs. Same reasoning as the axis-name tiebreak in the
-- question ordering — a sort that is only mostly determined is not determined.
--
-- Safe to re-run. It inserts what is missing and corrects the date of what is already
-- there, so running it twice changes nothing the second time.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Per person
-- ----------------------------------------------------------------------------

with earned as (
  select
    te.pair_id,
    te.user_id,
    te.created_at,
    sum(te.amount) over (
      partition by te.pair_id, te.user_id
      order by te.created_at, te.id
    ) as running
  from public.tender_entries te
  where te.reason = any (public.tender_earning_reasons())
),
crossings as (
  select e.pair_id, e.user_id, m.threshold, min(e.created_at) as reached_at
  from earned e
  cross join public.tender_milestones() m
  where e.running >= m.threshold
  group by e.pair_id, e.user_id, m.threshold
)
insert into public.tender_marks (pair_id, user_id, threshold, reached_at)
select pair_id, user_id, threshold, reached_at from crossings
on conflict (pair_id, user_id, threshold) where user_id is not null
do update set reached_at = excluded.reached_at;


-- ----------------------------------------------------------------------------
-- And for the couple, on their combined total
-- ----------------------------------------------------------------------------

with earned as (
  select
    te.pair_id,
    te.created_at,
    sum(te.amount) over (
      partition by te.pair_id
      order by te.created_at, te.id
    ) as running
  from public.tender_entries te
  where te.reason = any (public.tender_earning_reasons())
),
crossings as (
  select e.pair_id, m.threshold, min(e.created_at) as reached_at
  from earned e
  cross join public.tender_milestones() m
  where e.running >= m.threshold
  group by e.pair_id, m.threshold
)
insert into public.tender_marks (pair_id, user_id, threshold, reached_at)
select pair_id, null, threshold, reached_at from crossings
on conflict (pair_id, threshold) where user_id is null
do update set reached_at = excluded.reached_at;


-- ----------------------------------------------------------------------------
-- What it found
-- ----------------------------------------------------------------------------

do $$
declare
  v_people int;
  v_pairs  int;
begin
  select count(*) into v_people from public.tender_marks where user_id is not null;
  select count(*) into v_pairs  from public.tender_marks where user_id is null;
  raise notice 'tender marks: % personal, % joint', v_people, v_pairs;
end $$;

select
  p.first_name,
  m.threshold,
  ml.label,
  m.reached_at
from public.tender_marks m
join public.tender_milestones() ml on ml.threshold = m.threshold
left join public.profiles p on p.id = m.user_id
order by m.threshold, p.first_name nulls first;
