-- ============================================================================
-- question_for_pair_day only answers about your own pairing
--
-- Found by calling the deployed function as anon. It did not refuse — it ran, and
-- came back with its own "No such pairing" for a made-up UUID. So `anon` holds EXECUTE
-- on it, and the phase10 assertion that says otherwise passed locally while being
-- false in production.
--
-- TWO SEPARATE MISTAKES, AND THE SECOND IS THE REAL ONE
--
-- The grant. 0022 wrote `revoke all ... from public` then granted to `authenticated`,
-- which is the pattern the rest of this schema uses. It is not sufficient here:
-- Supabase's project-level default privileges grant EXECUTE on new functions to `anon`
-- by name, and revoking from PUBLIC does not touch a named-role grant. The mirror image
-- of the rich_list_rows trap, where a default grant to PUBLIC survived granting to
-- authenticated. 0012 and 0013 already knew this — both revoke from `anon` explicitly,
-- in a loop, and 0022 did not follow them.
--
-- The missing check, which would have mattered even with the grant right.
-- question_for_pair_day takes a pair_id and is SECURITY DEFINER, and it never asked
-- whether the caller is in that pairing. Anyone who could execute it could read — and
-- ASSIGN, since it writes — a day for a pairing they have nothing to do with. Only
-- reachable by guessing a v4 UUID, so not an open door, but the function had no reason
-- to trust its argument and did anyway.
--
-- That is the one worth fixing properly. A grant is a fence around a function; a
-- membership check is the function refusing to answer the wrong question. Bugs get into
-- fences. So: both.
--
-- WHY THE TEST GAVE FALSE COMFORT
--
-- `has_function_privilege('anon', ...)` is a true assertion about the database it runs
-- in, and the throwaway test database has no Supabase default privileges. The assertion
-- was not wrong; it was answering a question about the wrong machine. Making the revoke
-- explicit is what makes it true in both places — which is the only kind of assertion
-- worth having.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The membership check
--
-- Lifted from 0022 and changed in one place, per the rule 0023 established: to modify
-- a function here, copy the shipped one and edit the line that needs editing.
--
-- is_pair_member is SECURITY DEFINER and reads auth.uid(), so it still resolves
-- correctly when called from inside submit_answer's definer context — submit_answer
-- derives its pair from current_pair_id() and passes that, so the check it now passes
-- through is one it would satisfy anyway.
-- ----------------------------------------------------------------------------

create or replace function public.question_for_pair_day(p_pair_id uuid, p_day_index int)
returns public.questions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day      int := greatest(0, p_day_index);
  v_pace     text;
  v_id       text;
  v_row      public.questions;
  v_renew    int;
begin
  /*
   * Your own pairing, or nothing.
   *
   * First statement in the function on purpose: everything below either reads a
   * pairing's history or writes to it, so there is no ordering where doing the check
   * later would be equivalent.
   *
   * Same errcode as an absent pairing, and deliberately the same message. A caller who
   * is not a member learns nothing about whether the pairing exists — which is the
   * same reasoning peek_invite follows when it reports a declined invite without a
   * reason.
   */
  if not public.is_pair_member(p_pair_id) then
    raise exception 'No such pairing.' using errcode = 'P0002';
  end if;

  select question_id into v_id
  from public.pair_days
  where pair_id = p_pair_id and day_index = v_day;

  if v_id is null then
    select pace into v_pace from public.pairs where id = p_pair_id;
    if v_pace is null then
      raise exception 'No such pairing.' using errcode = 'P0002';
    end if;

    select o.question_id into v_id
    from public.question_order o
    where o.pace = v_pace
      and not exists (
        select 1 from public.pair_days d
        where d.pair_id = p_pair_id and d.question_id = o.question_id
      )
    order by o.position
    limit 1;

    if v_id is null then
      select count(*) into v_renew
      from public.question_order o
      join public.questions q on q.id = o.question_id
      where o.pace = v_pace and q.renewable;

      if v_renew = 0 then
        raise exception 'question bank is empty — run: npm run seed:questions';
      end if;

      select o.question_id into v_id
      from public.question_order o
      join public.questions q on q.id = o.question_id
      where o.pace = v_pace and q.renewable
      order by o.position
      offset (v_day % v_renew)
      limit 1;
    end if;

    insert into public.pair_days (pair_id, day_index, question_id)
    values (p_pair_id, v_day, v_id)
    on conflict (pair_id, day_index) do nothing;

    select question_id into v_id
    from public.pair_days
    where pair_id = p_pair_id and day_index = v_day;
  end if;

  select * into v_row from public.questions where id = v_id;
  return v_row;
end;
$$;


-- ----------------------------------------------------------------------------
-- And the fence, named-role by named-role
--
-- `from public` alone left the default grant to anon standing. Both are revoked here
-- so it does not matter which one a future default privilege arrives through.
-- ----------------------------------------------------------------------------

revoke all on function public.question_for_pair_day(uuid, int) from public;
revoke all on function public.question_for_pair_day(uuid, int) from anon;
grant execute on function public.question_for_pair_day(uuid, int) to authenticated;

revoke all on function public.set_pace(text) from public;
revoke all on function public.set_pace(text) from anon;
grant execute on function public.set_pace(text) to authenticated;
