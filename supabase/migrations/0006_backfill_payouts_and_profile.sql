-- ============================================================================
-- Sync — pay out reveals that were missed, and profile additions
--
-- Run after 0005_fulfilment_pays_seller.sql.
--
-- THE MISSED PAYOUTS
--
-- A couple completed a day and received nothing. The most likely cause is timing:
-- pay_out_reveal is called from inside submit_answer, so any reveal written before
-- 0002 was applied to the live database got a reveal row and no ledger entries.
-- Nothing retroactively noticed.
--
-- pay_out_reveal was already built to be idempotent — the unique index on
-- (pair_id, user_id, day_index, reason) makes a second call a no-op — so it can
-- simply be replayed for every reveal that is missing its entries. That fixes the
-- gap whatever caused it, rather than only the cause I happen to have guessed.
--
-- backfill_missing_payouts() is left in place deliberately. If the two ever drift
-- again, running it is the fix, and it costs nothing when there is nothing to do.
-- ============================================================================

create or replace function public.backfill_missing_payouts()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reveal record;
  v_fixed  int := 0;
begin
  for v_reveal in
    select r.pair_id, r.day_index
    from public.reveals r
    where not exists (
      select 1 from public.tender_entries e
      where e.pair_id = r.pair_id
        and e.day_index = r.day_index
        and e.reason = 'reveal'
    )
    order by r.pair_id, r.day_index
  loop
    perform public.pay_out_reveal(v_reveal.pair_id, v_reveal.day_index);
    v_fixed := v_fixed + 1;
  end loop;

  return v_fixed;
end;
$$;

grant execute on function public.backfill_missing_payouts() to authenticated;

do $$
declare v_fixed int;
begin
  v_fixed := public.backfill_missing_payouts();
  if v_fixed > 0 then
    raise notice 'paid out % reveal(s) that had been missed', v_fixed;
  else
    raise notice 'every reveal already has its payout';
  end if;
end $$;


-- ============================================================================
-- Profile: an editable name, and a separate choice about the Rich List
-- ============================================================================

-- What this person wants shown if the couple ever opts into the Rich List.
--
-- Separate from first_name on purpose. The name is what the app calls you and
-- what your partner sees; this is what a public leaderboard would show, and the
-- two are not the same decision. Putting two real first names on a list
-- discloses that two named people are a couple, which for some couples is a
-- safety problem rather than a preference — so each person controls their own,
-- and neither can publish the other.
alter table public.profiles
  add column if not exists list_display text not null default 'initial'
  check (list_display in ('name', 'initial', 'alias'));

-- Used only when list_display = 'alias'.
alter table public.profiles
  add column if not exists list_alias text
  check (list_alias is null or char_length(btrim(list_alias)) between 1 and 24);

/**
 * Rename yourself.
 *
 * Deliberately no history and no notification. It is your name; a pet name or a
 * pseudonym is a perfectly good answer, and changing it is nobody's business but
 * yours. Old reveals resolve names at render time, so a change applies to the
 * whole archive rather than only to what comes next.
 */
create or replace function public.update_profile(
  p_first_name   text,
  p_list_display text default null,
  p_list_alias   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_first_name, ''));
  v_alias text := nullif(btrim(coalesce(p_list_alias, '')), '');
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'A name, or whatever you want to be called.' using errcode = '22023';
  end if;
  if p_list_display is not null
     and p_list_display not in ('name', 'initial', 'alias') then
    raise exception 'Unknown display choice.' using errcode = '22023';
  end if;
  if p_list_display = 'alias' and v_alias is null then
    raise exception 'Type the alias you want shown.' using errcode = '22023';
  end if;

  update public.profiles
  set first_name   = v_name,
      list_display = coalesce(p_list_display, list_display),
      list_alias   = case
                       when p_list_display = 'alias' then v_alias
                       when p_list_display is null then list_alias
                       else list_alias
                     end
  where id = v_user;
end;
$$;

/** What a leaderboard would actually print for somebody. */
create or replace function public.list_label(p_user_id uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case p.list_display
    when 'name'  then p.first_name
    when 'alias' then coalesce(p.list_alias, upper(left(btrim(p.first_name), 1)))
    else upper(left(btrim(p.first_name), 1))
  end
  from public.profiles p
  where p.id = p_user_id
$$;

grant execute on function public.update_profile(text, text, text) to authenticated;
grant execute on function public.list_label(uuid)                 to authenticated;
