-- ============================================================================
-- Two more axes: values, and sex.
--
-- `values` covers behaviour, dealbreakers and goals — the axis that does the most
-- work for the app's actual claim, that you find out whether you have been
-- assuming the same thing all year.
--
-- `intimacy` is explicit, which is a deliberate reversal. desire.ts stops short of
-- sex acts and the reasoning there still holds for that axis; this is a separate
-- one, gated to week twelve of the sequence. The app is 18+ attested at signup,
-- but attestation is not consent to be asked tonight — twelve weeks of a kept
-- ritual is what earns it.
-- ============================================================================

alter table public.questions drop constraint if exists questions_category_check;
alter table public.questions add constraint questions_category_check
  check (category in (
    'light', 'logistics', 'deep', 'friction', 'desire', 'future',
    'values', 'intimacy'
  ));
