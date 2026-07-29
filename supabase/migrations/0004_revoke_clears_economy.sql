-- ============================================================================
-- Sync — revoking a mis-sent invite must clear the economy too
--
-- Run after 0003_tender_scale.sql.
--
-- THE BUG
--
-- revoke_claim() was written in Phase 1, before tender existed. It deleted the
-- wrong person's answers, the reveals, and their membership — and nothing else.
-- Once payouts existed, that left the pairing in a state that is not merely
-- untidy but wrong:
--
--   The inviter keeps the payout for a reveal that has been deleted, so
--   tender_earned — the figure the Rich List ranks on — counts a day that no
--   longer exists.
--
--   Worse, the payout is deduplicated on (pair, user, day_index, reason). The
--   inviter therefore stays marked as already paid for day 0. When the *right*
--   partner then joins and answers, pay_out_reveal credits the newcomer and
--   silently skips the inviter. One partner earns, the other doesn't — which
--   breaks the guarantee the whole economy rests on, that both partners always
--   earn the same amount from the same joint score.
--
-- THE FIX
--
-- Revoking resets the pairing to pending, so it resets the pairing's economy
-- with it. Nothing was really earned together, so nothing should be kept.
--
-- The inviter's own menu items survive deliberately. They wrote those, they still
-- mean them, and they are the one thing here not created *jointly* — making
-- somebody retype their menu because a link went to the wrong person would be
-- punishing them for somebody else's mistake.
-- ============================================================================

create or replace function public.revoke_claim()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid;
  v_invite  public.invites;
  v_wrong   uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  v_pair_id := public.current_pair_id();
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;

  select * into v_invite
  from public.invites
  where pair_id = v_pair_id and created_by = v_user
  order by created_at desc
  limit 1;

  if v_invite.id is null then
    raise exception 'Only the person who sent the link can undo it.' using errcode = 'P0009';
  end if;
  if v_invite.claimed_at is null then
    raise exception 'Nobody has used that link yet.' using errcode = 'P0010';
  end if;
  if v_invite.claimed_at < now() - interval '24 hours' then
    raise exception 'That window has closed.' using errcode = 'P0011';
  end if;

  v_wrong := v_invite.claimed_by;

  -- Anything the two of them made together.
  delete from public.answers where pair_id = v_pair_id and user_id = v_wrong;
  delete from public.reveals where pair_id = v_pair_id;

  -- The economy resets with the pairing. Purchases first: the ledger entries
  -- that reference them go in the same sweep, and leaving either behind would
  -- strand the other.
  delete from public.purchases      where pair_id = v_pair_id;
  delete from public.tender_entries where pair_id = v_pair_id;

  -- Their menu leaves with them. The inviter's stays — they wrote it, and it
  -- isn't the wrong person's to take away.
  delete from public.menu_items where pair_id = v_pair_id and owner_id = v_wrong;

  delete from public.pair_members where pair_id = v_pair_id and user_id = v_wrong;

  update public.invites
  set claimed_at = null,
      claimed_by = null,
      expires_at = greatest(expires_at, now() + interval '7 days')
  where id = v_invite.id;

  update public.pairs set status = 'pending' where id = v_pair_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.revoke_claim() from public;
grant execute on function public.revoke_claim() to authenticated;
