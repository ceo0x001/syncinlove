-- ============================================================================
-- Reissuing an invite, and tightening the one public free-text field.
--
-- The invite bug this fixes was a hard dead end. `insert into public.invites`
-- existed in exactly one place — inside create_pair — and create_pair returns
-- early with created=false for anybody who already has a pair. Invites expire
-- after seven days. So if a partner didn't claim the link in a week, the inviter
-- could never produce another one: no function minted a fresh invite for an
-- existing pairing, and the only escape was abandoning the account. That is the
-- most important conversion step in the product failing silently.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Reissue
-- ----------------------------------------------------------------------------

/**
 * Mint a fresh invite for a pairing that nobody has joined yet.
 *
 * Refuses once the pairing is complete, which is the safety property that
 * matters: a live couple must not be able to conjure a link that would let a
 * third person attempt to join, and an inviter must not be able to quietly
 * replace their partner. `revoke_claim` remains the (deliberately heavier) route
 * for undoing a pairing that has already been claimed.
 *
 * Older invites for the pair are revoked rather than deleted. The row is the
 * record that a link once existed, and claim_invite already refuses a revoked
 * one — so a link sent last week stops working the moment a new one is made,
 * which is the behaviour somebody reissuing actually wants.
 */
create or replace function public.reissue_invite(
  p_token_hash text,
  p_nonce      text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid;
  v_members int;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  v_pair_id := public.current_pair_id();
  if v_pair_id is null then
    raise exception 'You have no pairing to invite anybody to.' using errcode = '22023';
  end if;

  -- The whole pair's membership, not just the caller's row. Filtering the count
  -- to the caller is the exact mistake that once let somebody abandon a live
  -- pairing, so it is spelled out here.
  select count(*) into v_members
  from public.pair_members
  where pair_id = v_pair_id
    and left_at is null;

  if v_members > 1 then
    raise exception 'Somebody has already joined this pairing.' using errcode = '22023';
  end if;

  update public.invites
  set revoked_at = now()
  where pair_id = v_pair_id
    and claimed_at is null
    and revoked_at is null;

  insert into public.invites (pair_id, token_hash, nonce, created_by, expires_at)
  values (v_pair_id, p_token_hash, p_nonce, v_user, p_expires_at);

  return jsonb_build_object('pair_id', v_pair_id, 'reissued', true);
end;
$$;

grant execute on function public.reissue_invite(text, text, timestamptz) to authenticated;


-- ----------------------------------------------------------------------------
-- The public alias
--
-- list_alias is the only free text this app shows to strangers. It was checked
-- for length and nothing else, which left a public leaderboard able to display a
-- phone number. Digits alone are now refused at the database level as well as in
-- the UI, because the UI is not where a rule like this should ultimately live.
-- ----------------------------------------------------------------------------

-- Clear anything already stored that the new rule would reject, so the
-- constraint can be trusted rather than merely declared.
update public.profiles
set list_alias = null,
    list_display = case when list_display = 'alias' then 'initial' else list_display end
where list_alias is not null
  and btrim(list_alias) ~ '^[0-9[:punct:][:space:]]+$';

alter table public.profiles drop constraint if exists profiles_list_alias_check;

alter table public.profiles
  add constraint profiles_list_alias_check check (
    list_alias is null
    or (
      char_length(btrim(list_alias)) between 1 and 24
      -- At least one letter. Blocks "07012345678" and "+234 816 258 9880"
      -- without policing what anybody chooses to call themselves.
      and btrim(list_alias) ~ '[[:alpha:]]'
    )
  );


/**
 * update_profile, with the alias rule enforced and reported.
 *
 * Each failure raises its own message. A single "invalid alias" would leave
 * somebody guessing which of three rules they broke.
 */
create or replace function public.update_profile(
  p_first_name   text,
  p_list_display text default null,
  p_list_alias   text default null,
  p_list_opt_in  boolean default null
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
  if v_alias is not null and char_length(v_alias) > 24 then
    raise exception 'That alias is too long — 24 characters at most.' using errcode = '22023';
  end if;
  if v_alias is not null and v_alias !~ '[[:alpha:]]' then
    raise exception 'An alias needs at least one letter in it.' using errcode = '22023';
  end if;

  update public.profiles
  set first_name   = v_name,
      list_display = coalesce(p_list_display, list_display),
      list_alias   = case
                       when p_list_display = 'alias' then v_alias
                       when p_list_display is null then list_alias
                       else list_alias
                     end,
      list_opt_in  = coalesce(p_list_opt_in, list_opt_in)
  where id = v_user;
end;
$$;

grant execute on function public.update_profile(text, text, text, boolean) to authenticated;
