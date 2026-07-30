-- ============================================================================
-- Declining an invite
--
-- Somebody already paired who follows a new link hits a wall, and two people are
-- left worse off by it. The follower gets `You are already paired with somebody.`
-- with no hint of what to do about it. The sender gets nothing at all — their link
-- sits unclaimed forever and reads as "they never opened it".
--
-- THE PART THAT IS NOT OBVIOUS
--
-- The tempting fix is to tell the sender WHY: "they could not join, they are
-- already paired with somebody". That is a disclosure the sender has no right to.
-- Send a link to somebody you are interested in, and the app would report their
-- relationship status back to you — something they never chose to tell you. It is
-- the same shape of leak the Rich List's two-sided consent and the destroyed
-- letter's silence exist to prevent, and it would arrive by default rather than by
-- anybody's choice.
--
-- So declining is an explicit act by the person who received the link, and what
-- reaches the sender carries no reason. "They can't join right now" is what a real
-- "no thanks" conveys, and the recipient decides whether to send it at all. Saying
-- nothing stays available and costs them nothing.
--
-- Declining also closes the link. A forwarded copy must not stay claimable after
-- the person it was meant for has said no; the sender can mint a fresh one with
-- reissue_invite.
-- ============================================================================

alter table public.invites
  add column if not exists declined_at timestamptz,
  add column if not exists declined_by uuid references public.profiles (id) on delete set null;

comment on column public.invites.declined_at is
  'The recipient chose to tell the sender they cannot join. Never set automatically '
  'and never carries a reason — see 0018.';


-- ----------------------------------------------------------------------------
-- decline_invite
--
-- SECURITY DEFINER because the decliner has no read access to somebody else's
-- invite row, and should not be given any: everything they are allowed to learn
-- about it already comes through peek_invite.
-- ----------------------------------------------------------------------------

create or replace function public.decline_invite(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_invite public.invites;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  select * into v_invite
  from public.invites
  where token_hash = p_token_hash
  for update;

  if v_invite.id is null then
    raise exception 'That link is not valid.' using errcode = 'P0002';
  end if;

  -- Declining your own link is meaningless, and allowing it would let somebody
  -- put their own pairing into a state their partner has to interpret.
  if v_invite.created_by = v_user then
    raise exception 'That is your own invite link.' using errcode = 'P0006';
  end if;

  -- A claimed invite is somebody's live pairing. Declining must never be a way to
  -- reach into one that has already formed.
  if v_invite.claimed_at is not null then
    raise exception 'That link has already been used.' using errcode = 'P0007';
  end if;

  -- Idempotent. The button can be pressed twice, or on a stale page, and the
  -- second press must not error at somebody who has already made their choice.
  if v_invite.declined_at is not null then
    return;
  end if;

  update public.invites
  set declined_at = now(),
      declined_by = v_user,
      -- Closed as well as declined. A forwarded copy must not remain claimable
      -- once the person it was meant for has said no.
      revoked_at  = coalesce(revoked_at, now())
  where id = v_invite.id;
end;
$$;

revoke all on function public.decline_invite(text) from public;
grant execute on function public.decline_invite(text) to authenticated;


-- ----------------------------------------------------------------------------
-- peek_invite, reporting declined
--
-- Checked BEFORE revoked, because decline_invite sets both and the more specific
-- state is the useful one. Ordered the other way, a declined link would report
-- itself as merely cancelled and the recipient revisiting it would be told their
-- own choice was somebody else's.
-- ----------------------------------------------------------------------------

create or replace function public.peek_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_invite public.invites;
  v_name   text;
  v_taken  boolean;
begin
  select * into v_invite from public.invites where token_hash = p_token_hash;

  if v_invite.id is null then
    return jsonb_build_object('state', 'unknown');
  end if;

  select p.first_name into v_name
  from public.profiles p
  where p.id = v_invite.created_by;

  if v_invite.declined_at is not null then
    return jsonb_build_object('state', 'declined', 'inviter_first_name', v_name);
  end if;

  if v_invite.revoked_at is not null then
    return jsonb_build_object('state', 'revoked');
  end if;

  if v_invite.claimed_at is not null then
    return jsonb_build_object(
      'state', case when v_invite.claimed_by = auth.uid() then 'claimed_by_you' else 'claimed' end,
      'inviter_first_name', v_name
    );
  end if;

  if v_invite.expires_at < now() then
    return jsonb_build_object('state', 'expired', 'inviter_first_name', v_name);
  end if;

  select exists (
    select 1 from public.pair_members
    where pair_id = v_invite.pair_id and role = 'invitee' and left_at is null
  ) into v_taken;

  if v_taken then
    return jsonb_build_object('state', 'claimed', 'inviter_first_name', v_name);
  end if;

  return jsonb_build_object(
    'state', 'open',
    'inviter_first_name', v_name,
    'pair_id', v_invite.pair_id
  );
end;
$$;

revoke all on function public.peek_invite(text) from public;
grant execute on function public.peek_invite(text) to authenticated, anon;


-- ----------------------------------------------------------------------------
-- reissue_invite, after a decline
--
-- 0009 refuses to mint a new link while one is live. A declined link is revoked,
-- so it already passes — but it would leave declined_at set on the pairing's
-- history with a fresh link beside it. Clearing it on reissue keeps the inviter's
-- panel reporting the CURRENT link's state rather than the last one's.
-- ----------------------------------------------------------------------------

create or replace function public.clear_declines()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.invites
  set declined_at = null, declined_by = null
  where pair_id = public.current_pair_id()
    and declined_at is not null
    and claimed_at is null;
$$;

revoke all on function public.clear_declines() from public;
grant execute on function public.clear_declines() to authenticated;
