-- ============================================================================
-- submit_answer asks the pair which question today is
--
-- The flip. 0022 built pace, the three orderings and pair_days and wired none of it
-- up; this points the one server-side reader at it, and the deploy carrying this also
-- switches TypeScript over.
--
-- Both halves have to move together. submit_answer re-validates the payload against
-- the day's question — that is why it looks the question up rather than trusting what
-- arrives — so if it resolves a different question than the client rendered, every
-- submission fails on a facet id that does not exist. There is no ordering of two
-- deploys that avoids that, only a window where the app is broken.
--
-- WHAT CHANGES FOR A COUPLE MID-ROTATION
--
-- Nothing they have answered. 64 pair-days were backfilled, every one traced to a real
-- reveal or answer, and question_for_pair_day never returns a question a pair already
-- has a row for. What changes is what comes next: upcoming questions now come from
-- their pace's spiral rather than from the old ramp.
--
-- ONE LINE, AND WHY THIS FILE IS OTHERWISE A COPY
--
-- The body below is 0002's submit_answer verbatim, with the question lookup changed
-- and nothing else. It is a copy rather than a rewrite because I first wrote this
-- function out from memory and diffed it: five differences, including a return shape
-- of {"revealed": false} where the real one returns {"state": "waiting", ...}. That
-- alone would have broken every submission while looking completely reasonable in
-- review. Same failure as the rich_list_rows regression, which invented two plausible
-- label columns twice.
--
-- So the rule this file follows: to change a long function here, copy the shipped one
-- and edit the line that needs editing.
--
-- WHAT THIS DOES NOT TOUCH
--
-- question_for_day(int) stays. It is still granted and becomes dead the moment this
-- deploys, but removing it in the same migration that changes the submit path would
-- mean two things to unpick on a revert. Dead code removal is its own commit.
-- ============================================================================


create or replace function public.submit_answer(
  p_day_index int,
  p_self      jsonb,
  p_guess     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       uuid := auth.uid();
  v_pair_id    uuid;
  v_question   public.questions;
  v_facet      jsonb;
  v_id         text;
  v_kind       text;
  v_value      jsonb;
  v_other      public.answers;
  v_a          public.answers;
  v_b          public.answers;
  v_a_read_b   jsonb;
  v_b_read_a   jsonb;
  v_sync       int;
  v_count      int;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  v_pair_id := public.current_pair_id();
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;

  if not public.pair_day_is_open(v_pair_id, p_day_index) then
    raise exception 'That question has closed.' using errcode = 'P0003';
  end if;

  -- The only line that differs from 0002. Was question_for_day(p_day_index).
  v_question := public.question_for_pair_day(v_pair_id, p_day_index);

  for v_facet in select * from jsonb_array_elements(v_question.facets) loop
    v_id := v_facet ->> 'id';
    v_kind := v_facet ->> 'kind';

    foreach v_value in array array[p_self -> v_id, p_guess -> v_id] loop
      if v_value is null or jsonb_typeof(v_value) = 'null' then
        raise exception 'Missing answer for "%".', v_id using errcode = '22023';
      end if;

      if v_kind = 'choice' then
        if not exists (
          select 1
          from jsonb_array_elements(v_facet -> 'options') o
          where o -> 'id' = v_value
        ) then
          raise exception 'Invalid option for "%".', v_id using errcode = '22023';
        end if;
      else
        if jsonb_typeof(v_value) <> 'number' then
          raise exception 'Facet "%" must be a number.', v_id using errcode = '22023';
        end if;
      end if;
    end loop;
  end loop;

  insert into public.answers (pair_id, day_index, question_id, user_id, self_payload, guess_payload)
  values (v_pair_id, p_day_index, v_question.id, v_user, p_self, p_guess)
  on conflict (pair_id, day_index, user_id) do nothing;

  select * into v_other
  from public.answers
  where pair_id = v_pair_id
    and day_index = p_day_index
    and user_id <> v_user
  limit 1;

  if v_other.id is null then
    return jsonb_build_object('state', 'waiting', 'day_index', p_day_index);
  end if;

  select * into v_a
  from public.answers
  where pair_id = v_pair_id and day_index = p_day_index
  order by user_id asc
  limit 1;

  select * into v_b
  from public.answers
  where pair_id = v_pair_id and day_index = p_day_index
  order by user_id desc
  limit 1;

  v_a_read_b := public.score_direction(v_question.facets, v_b.self_payload, v_a.guess_payload);
  v_b_read_a := public.score_direction(v_question.facets, v_a.self_payload, v_b.guess_payload);
  v_sync := round(((v_a_read_b ->> 'total')::numeric + (v_b_read_a ->> 'total')::numeric) / 2)::int;

  insert into public.reveals (pair_id, day_index, question_id, sync_score, payload)
  values (
    v_pair_id,
    p_day_index,
    v_question.id,
    v_sync,
    jsonb_build_object(
      'a', jsonb_build_object(
        'user_id', v_a.user_id,
        'self', v_a.self_payload,
        'guess', v_a.guess_payload,
        'submitted_at', v_a.submitted_at
      ),
      'b', jsonb_build_object(
        'user_id', v_b.user_id,
        'self', v_b.self_payload,
        'guess', v_b.guess_payload,
        'submitted_at', v_b.submitted_at
      ),
      'a_read_b', v_a_read_b,
      'b_read_a', v_b_read_a
    )
  )
  on conflict (pair_id, day_index) do nothing;

  update public.pairs set status = 'active' where id = v_pair_id and status = 'pending';

  -- Same transaction as the reveal, so a reveal can never exist unpaid.
  perform public.pay_out_reveal(v_pair_id, p_day_index);

  select count(*) into v_count from public.reveals where pair_id = v_pair_id;

  return jsonb_build_object(
    'state', 'revealed',
    'day_index', p_day_index,
    'sync_score', v_sync,
    'reveal_count', v_count,
    'earned', public.tender_payout_for_score(v_sync)
  );
end;
$$;

revoke all on function public.submit_answer(int, jsonb, jsonb) from public;
grant execute on function public.submit_answer(int, jsonb, jsonb) to authenticated;
