-- ============================================================================
-- "You'd be number 3."
--
-- The Rich List page explained its own scoring rules to people who were not on
-- it, which is the least persuasive thing it could have said. The persuasive
-- thing is the position they already hold and cannot see.
--
-- So rich_list_me now computes two things it did not:
--
--   earned      what this couple has actually earned, whether or not they have
--               opted in. Before, it came from rich_list_rows, which requires
--               both partners to have opted in — so anybody not on the list was
--               told they had earned nothing, which was false and happened to be
--               the exact number that would have made them want to join.
--
--   would_rank  where they would sit if they joined right now.
--
-- would_rank leaks nothing. It is a count of how many opted-in couples are ahead
-- of them, which tells them about their own position and nothing about anybody
-- else's — the same shape of answer the list already gives publicly, minus the
-- names.
-- ============================================================================

create or replace function public.rich_list_me(p_window text default 'all')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_user   uuid := auth.uid();
  v_pair   uuid := public.current_pair_id();
  v_me     boolean;
  v_partner boolean;
  v_rank   int;
  v_earned int;
  v_would  int;
  v_since  timestamptz;
  v_total  int;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  select coalesce(bool_or(pr.id = v_user and pr.list_opt_in), false),
         coalesce(bool_or(pr.id <> v_user and pr.list_opt_in), false)
    into v_me, v_partner
  from public.pair_members pm
  join public.profiles pr on pr.id = pm.user_id
  where pm.pair_id = v_pair
    and pm.left_at is null;

  -- This couple's own earnings, independent of any opt-in. Same definition the
  -- list ranks on: payouts and streak bonuses, never transfers or refunds.
  select coalesce(sum(t.amount), 0)::int
    into v_earned
  from public.tender_entries t
  where t.pair_id = v_pair
    and t.amount > 0
    and t.reason in ('reveal', 'solo', 'streak')
    and (p_window <> 'week' or t.created_at >= now() - interval '7 days');

  select p.created_at into v_since from public.pairs p where p.id = v_pair;

  -- Where they would land. Ties break toward the older pairing, matching
  -- rich_list's own ordering, so a quoted position is the one they would get.
  select count(*) + 1
    into v_would
  from public.rich_list_rows(
    case when p_window = 'week' then now() - interval '7 days' else null end
  ) x
  where x.earned > 0
    and x.pair_id <> coalesce(v_pair, '00000000-0000-0000-0000-000000000000'::uuid)
    and (x.earned > v_earned
         or (x.earned = v_earned and x.since < coalesce(v_since, now())));

  -- The actual rank, which only exists once they are genuinely on the list.
  select r.rank
    into v_rank
  from (
    select
      row_number() over (order by x.earned desc, x.since asc, x.pair_id) as rank,
      x.pair_id
    from public.rich_list_rows(
      case when p_window = 'week' then now() - interval '7 days' else null end
    ) x
    where x.earned > 0
  ) r
  where r.pair_id = v_pair;

  select count(*)
    into v_total
  from public.rich_list_rows(
    case when p_window = 'week' then now() - interval '7 days' else null end
  ) x
  where x.earned > 0;

  return jsonb_build_object(
    'opted_in',         coalesce(v_me, false),
    'partner_opted_in', coalesce(v_partner, false),
    'rank',             v_rank,
    'earned',           coalesce(v_earned, 0),
    'would_rank',       v_would,
    'listed_couples',   coalesce(v_total, 0)
  );
end;
$$;

grant execute on function public.rich_list_me(text) to authenticated;
