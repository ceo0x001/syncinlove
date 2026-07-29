-- ============================================================================
-- Sync — Phase 4: the letter vault, and the exits
--
-- Run after 0006_backfill_payouts_and_profile.sql.
--
-- This is the phase that makes the app safe to hand to couples who might not
-- last. A sealed letter is a message you cannot take back, arriving on a date
-- chosen months earlier — which in a relationship that has gone wrong is a
-- delivery mechanism for an abuser, and in one that has merely ended is simply
-- cruel. Everything below is shaped by that.
--
-- Three rules the code enforces rather than merely intends:
--
--   1. The recipient can destroy any sealed letter addressed to them, unopened,
--      unilaterally, at any time — and the sender is never told which one.
--   2. A letter never becomes readable to somebody who is no longer paired.
--      The unlock date passing while unpaired does not open it.
--   3. Deleting means deleting. Burn is a hard delete, not a flag.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The vault
-- ----------------------------------------------------------------------------

create table if not exists public.letters (
  id           uuid primary key default gen_random_uuid(),
  pair_id      uuid not null references public.pairs (id) on delete cascade,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  body         text not null check (char_length(btrim(body)) between 1 and 8000),
  /** Pair-local date it may be opened. Never before. */
  unlock_on    date not null,
  /**
   * Whether the recipient may see the unlock date before it arrives.
   *
   * The sender's choice, as specified: hidden is a surprise, visible is
   * anticipation. Two genuinely different gifts.
   */
  date_visible boolean not null default true,
  opened_at    timestamptz,
  created_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists letters_pair_idx on public.letters (pair_id);
create index if not exists letters_recipient_idx on public.letters (recipient_id, unlock_on);

alter table public.letters enable row level security;

-- ============================================================================
-- The letters policy is the most delicate in the schema.
--
-- A sealed letter's BODY must be unreadable — including by the recipient, who is
-- the one person motivated to peek. So the row is not selectable at all until it
-- is unlockable. The recipient learns a letter exists through a function that
-- returns counts and, when the sender allowed it, dates. Never the text.
--
-- The sender can always read their own: they wrote it, and being unable to
-- reread what you sent would be strange rather than safe.
-- ============================================================================
drop policy if exists letters_select on public.letters;
create policy letters_select on public.letters
  for select using (
    sender_id = auth.uid()
    or (
      recipient_id = auth.uid()
      -- Unlocked, and only while the pairing still stands. A letter must never
      -- arrive for somebody who has left.
      and public.is_pair_member(pair_id)
      and unlock_on <= (
        select (now() at time zone p.time_zone)::date
        from public.pairs p where p.id = letters.pair_id
      )
    )
  );

grant select on public.letters to authenticated;

/** Cumulative completed days. The vault opens at 30 of these. */
create or replace function public.completed_days(p_pair_id uuid default null)
returns int
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select count(*)::int
  from public.reveals
  where pair_id = coalesce(p_pair_id, public.current_pair_id())
$$;

/**
 * Whether the vault is open.
 *
 * Thirty CUMULATIVE days, not thirty consecutive. Gating a headline feature on a
 * streak means one missed day can lock a couple out of it for good, which is a
 * punishment out of all proportion to forgetting once.
 */
create or replace function public.vault_open()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.completed_days() >= 30
$$;

/**
 * Seal a letter.
 *
 * Requires a confirmed email. Sealing something that cannot be recalled is
 * consequential, and a session that cannot prove whose it is should not be able
 * to do it.
 */
create or replace function public.seal_letter(
  p_title        text,
  p_body         text,
  p_unlock_on    date,
  p_date_visible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_pair_id   uuid := public.current_pair_id();
  v_recipient uuid;
  v_today     date;
  v_id        uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;
  if not public.is_claimed() then
    raise exception 'Add your email before sealing a letter.' using errcode = 'P0012';
  end if;
  if not public.vault_open() then
    raise exception 'The vault opens after 30 days together.' using errcode = 'P0018';
  end if;

  select user_id into v_recipient
  from public.pair_members
  where pair_id = v_pair_id and user_id <> v_user and left_at is null
  limit 1;

  if v_recipient is null then
    raise exception 'There is nobody to write to yet.' using errcode = 'P0002';
  end if;

  select (now() at time zone time_zone)::date into v_today
  from public.pairs where id = v_pair_id;

  if p_unlock_on is null or p_unlock_on <= v_today then
    raise exception 'Pick a date in the future.' using errcode = '22023';
  end if;
  if p_unlock_on > v_today + interval '50 years' then
    raise exception 'That is further off than this app can promise.' using errcode = '22023';
  end if;

  insert into public.letters
    (pair_id, sender_id, recipient_id, title, body, unlock_on, date_visible)
  values (
    v_pair_id, v_user, v_recipient,
    btrim(p_title), btrim(p_body), p_unlock_on, coalesce(p_date_visible, true)
  )
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * What the recipient is allowed to know about letters waiting for them.
 *
 * Counts always. Dates only where the sender chose to reveal them. Titles and
 * bodies never — those arrive when the letter opens, through the ordinary policy.
 */
create or replace function public.sealed_for_me()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        -- Only when the sender allowed it. Otherwise the recipient knows a
        -- letter exists and nothing else, which is the surprise they were given.
        'unlock_on', case when l.date_visible then l.unlock_on else null end,
        'date_visible', l.date_visible
      )
      order by l.unlock_on
    ),
    '[]'::jsonb
  )
  from public.letters l
  join public.pairs p on p.id = l.pair_id
  where l.recipient_id = auth.uid()
    and l.pair_id = public.current_pair_id()
    and l.unlock_on > (now() at time zone p.time_zone)::date
$$;

/** Mark a letter as read, once it is legitimately readable. */
create or replace function public.open_letter(p_letter_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_hit uuid;
begin
  update public.letters l
  set opened_at = now()
  where l.id = p_letter_id
    and l.recipient_id = auth.uid()
    and l.opened_at is null
    and public.is_pair_member(l.pair_id)
    and l.unlock_on <= (
      select (now() at time zone p.time_zone)::date
      from public.pairs p where p.id = l.pair_id
    )
  returning l.id into v_hit;

  if v_hit is null then
    raise exception 'That letter is not open to you.' using errcode = '42501';
  end if;
end;
$$;

/**
 * The recipient destroys a sealed letter, unopened, without reading it.
 *
 * Unilateral, unconditional, and silent. This is the most important function in
 * Phase 4: it is what stops a sealed letter being a scheduled message from
 * somebody the recipient no longer wants to hear from. There is no approval, no
 * reason field, and the sender is never told which letter went — being told
 * would turn the refusal itself into a message.
 *
 * A hard delete, because a soft flag would leave the text sitting in the table
 * for anybody with database access.
 */
create or replace function public.destroy_letter(p_letter_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_hit uuid;
begin
  delete from public.letters
  where id = p_letter_id
    and recipient_id = auth.uid()
  returning id into v_hit;

  if v_hit is null then
    raise exception 'That is not yours to destroy.' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.completed_days(uuid)                       to authenticated;
grant execute on function public.vault_open()                               to authenticated;
grant execute on function public.seal_letter(text, text, date, boolean)     to authenticated;
grant execute on function public.sealed_for_me()                            to authenticated;
grant execute on function public.open_letter(uuid)                          to authenticated;
grant execute on function public.destroy_letter(uuid)                       to authenticated;


-- ----------------------------------------------------------------------------
-- Export
--
-- Everything this person is entitled to, as one JSON document. Doubles as the
-- answer to a data request, which is nearly free once it exists.
--
-- Deliberately excludes the partner's un-revealed answers and any sealed letter's
-- text. Leaving would otherwise be a way to read what you were never shown.
-- ----------------------------------------------------------------------------

create or replace function public.export_archive()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid := public.current_pair_id();
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'me', (
      select jsonb_build_object('first_name', first_name, 'joined', created_at)
      from public.profiles where id = v_user
    ),
    'pair', (
      select jsonb_build_object(
        'started', day_zero, 'time_zone', time_zone, 'status', status,
        'days_together', public.completed_days(v_pair_id)
      )
      from public.pairs where id = v_pair_id
    ),
    'reveals', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'day', r.day_index, 'question', r.question_id,
          'sync_score', r.sync_score, 'at', r.revealed_at, 'detail', r.payload
        ) order by r.day_index
      ), '[]'::jsonb)
      from public.reveals r where r.pair_id = v_pair_id
    ),
    'my_answers', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'day', a.day_index, 'question', a.question_id,
          'about_me', a.self_payload, 'my_guess', a.guess_payload, 'at', a.submitted_at
        ) order by a.day_index
      ), '[]'::jsonb)
      from public.answers a where a.pair_id = v_pair_id and a.user_id = v_user
    ),
    'tender', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'amount', e.amount, 'reason', e.reason, 'day', e.day_index,
          'detail', e.detail, 'at', e.created_at
        ) order by e.created_at
      ), '[]'::jsonb)
      from public.tender_entries e
      where e.pair_id = v_pair_id and e.user_id = v_user
    ),
    'my_menu', (
      select coalesce(jsonb_agg(
        jsonb_build_object('title', m.title, 'price', m.price, 'listed', m.active)
      ), '[]'::jsonb)
      from public.menu_items m where m.pair_id = v_pair_id and m.owner_id = v_user
    ),
    'requests', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'title', pu.title, 'price', pu.price, 'status', pu.status,
          'i_asked', pu.buyer_id = v_user, 'at', pu.created_at
        ) order by pu.created_at
      ), '[]'::jsonb)
      from public.purchases pu where pu.pair_id = v_pair_id
    ),
    -- Letters written by this person in full; letters TO them only once open.
    -- A sealed letter's text is not theirs to take early by leaving.
    'letters_i_wrote', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'title', l.title, 'body', l.body,
          'unlock_on', l.unlock_on, 'opened', l.opened_at is not null
        ) order by l.unlock_on
      ), '[]'::jsonb)
      from public.letters l where l.pair_id = v_pair_id and l.sender_id = v_user
    ),
    'letters_to_me_opened', (
      select coalesce(jsonb_agg(
        jsonb_build_object('title', l.title, 'body', l.body, 'unlock_on', l.unlock_on)
        order by l.unlock_on
      ), '[]'::jsonb)
      from public.letters l
      where l.pair_id = v_pair_id and l.recipient_id = v_user and l.opened_at is not null
    ),
    'letters_to_me_still_sealed', public.sealed_for_me()
  );
end;
$$;

grant execute on function public.export_archive() to authenticated;


-- ----------------------------------------------------------------------------
-- Ending it
--
-- Two separate acts, deliberately:
--
--   end_pairing()  the relationship in the app ends. What happens to sealed
--                  letters is the caller's explicit choice.
--   burn_everything()  this person's account and content are destroyed.
--
-- The rule on shared history, stated in the product because ambiguity here is
-- what generates real anger: you can always delete what you wrote and your own
-- account; you cannot delete what your partner wrote.
-- ----------------------------------------------------------------------------

/**
 * End the pairing.
 *
 * p_letters decides the vault, and the UI defaults it to 'burn' for anything
 * sealed and unopened. A love letter arriving three weeks after a split is a
 * cruel thing to have built, so the kind option has to be the default rather
 * than the one you have to find.
 *
 *   'burn'  destroy every unopened sealed letter in both directions
 *   'keep'  leave them; they still will not open to anybody unpaired
 *
 * Either partner may do this alone. Requiring agreement to leave would be a way
 * to hold somebody in.
 */
create or replace function public.end_pairing(p_letters text default 'burn')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid := public.current_pair_id();
  v_burned  int := 0;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;
  if p_letters not in ('burn', 'keep') then
    raise exception 'Unknown choice for the letters.' using errcode = '22023';
  end if;

  if p_letters = 'burn' then
    with gone as (
      delete from public.letters
      where pair_id = v_pair_id and opened_at is null
      returning 1
    )
    select count(*) into v_burned from gone;
  end if;

  -- Outstanding requests are closed and refunded. Leaving somebody's tender
  -- stranded in a request that will never be honoured would be a petty way to
  -- end things.
  insert into public.tender_entries (pair_id, user_id, amount, reason, purchase_id, detail)
  select pu.pair_id, pu.buyer_id, pu.price, 'refund', pu.id,
         jsonb_build_object('title', pu.title, 'declined_by', 'pairing ended')
  from public.purchases pu
  where pu.pair_id = v_pair_id and pu.status = 'requested'
  on conflict do nothing;

  update public.purchases
  set status = 'declined', declined_at = now()
  where pair_id = v_pair_id and status = 'requested';

  -- Nothing is deleted beyond the letters. The archive becomes read-only, and
  -- both people keep what they already saw.
  update public.pair_members set left_at = now()
  where pair_id = v_pair_id and left_at is null;

  update public.pairs set status = 'ended', ended_at = now() where id = v_pair_id;

  return jsonb_build_object('ok', true, 'letters_burned', v_burned);
end;
$$;

/**
 * Burn everything.
 *
 * Destroys this person's account and everything they wrote. A hard delete: the
 * cascade from auth.users takes the profile, their answers, their menu and their
 * ledger with it, and the letters they sent go explicitly.
 *
 * What it does NOT delete is what the partner wrote. Shared history is jointly
 * authored, and one person cannot erase the other's copy of it.
 *
 * Requires a confirmed account. An irreversible action should not be available
 * to a session that cannot prove whose it is.
 */
create or replace function public.burn_everything(p_confirm text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid := public.current_pair_id();
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if not public.is_claimed() then
    raise exception 'Add your email first — this cannot be undone.' using errcode = 'P0012';
  end if;
  -- Typed confirmation. A button alone is too easy to hit by accident for
  -- something with no undo.
  if upper(btrim(coalesce(p_confirm, ''))) <> 'BURN' then
    raise exception 'Type BURN to confirm.' using errcode = '22023';
  end if;

  if v_pair_id is not null then
    -- Everything this person wrote into the vault, read or not.
    delete from public.letters where sender_id = v_user;
    -- And every sealed letter addressed to them, which is theirs to refuse.
    delete from public.letters where recipient_id = v_user and opened_at is null;

    update public.pair_members set left_at = now()
    where pair_id = v_pair_id and user_id = v_user and left_at is null;

    update public.pairs set status = 'ended', ended_at = now()
    where id = v_pair_id and status <> 'ended';
  end if;

  -- Cascades to profiles -> answers, menu_items, tender_entries, purchases.
  delete from auth.users where id = v_user;
end;
$$;

grant execute on function public.end_pairing(text)     to authenticated;
grant execute on function public.burn_everything(text) to authenticated;
