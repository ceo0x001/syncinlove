-- ============================================================================
-- Sync — Phase 3: tender
--
-- Run after 0001_phase1_loop.sql, then re-run supabase/seed/questions.sql
-- (the bank grew to 60 and gained two columns).
--
-- The economy in one paragraph: accuracy pays. Each partner has their own
-- wallet, both earn the same amount from the couple's joint score, and the only
-- thing tender buys is items from the other person's self-written menu. Nothing
-- here can force anybody to honour anything — a purchase is a request the seller
-- may decline and refund at any time, for any reason or none.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Question bank additions
-- ----------------------------------------------------------------------------

-- Six axes now. friction and desire arrive late in the rotation.
alter table public.questions drop constraint if exists questions_category_check;
alter table public.questions add constraint questions_category_check
  check (category in ('light', 'logistics', 'deep', 'friction', 'desire', 'future'));

-- Whether a question is worth asking twice.
--
-- Trait questions aren't: both partners saw each other's answer at the reveal,
-- so asking again scores full marks from memory. Recycling them would inflate
-- every score across the second pass for reasons unconnected to the couple, and
-- now that accuracy pays, inflate the money supply with them.
alter table public.questions add column if not exists renewable boolean not null default true;


-- ----------------------------------------------------------------------------
-- The ledger
--
-- Append-only, one row per movement. Deliberately NOT a balance column.
--
-- Balances are derived. That costs a sum on read and buys three things a counter
-- can't: the Rich List can rank on tender *earned* (which a net balance destroys
-- the moment anybody spends), "where did our tender go" is answerable, and a
-- double-spend is impossible to hide because every debit is a row somebody can
-- point at.
-- ----------------------------------------------------------------------------

create table if not exists public.tender_entries (
  id          uuid primary key default gen_random_uuid(),
  pair_id     uuid not null references public.pairs (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  -- Positive credits, negative debits. Never zero.
  amount      int not null check (amount <> 0),
  reason      text not null check (reason in (
    'reveal',        -- both answered: completion + accuracy
    'solo',          -- answered alone, window closed: completion only
    'purchase',      -- debit, buying from the partner's menu
    'refund',        -- credit, the seller declined or cancelled
    'adjustment'     -- manual correction; no UI writes this
  )),
  /** The day this relates to, for reveal and solo entries. */
  day_index   int,
  /** The purchase this relates to, for purchase and refund entries. */
  purchase_id uuid,
  /** How the number was arrived at — completion vs accuracy split, the score. */
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists tender_entries_wallet_idx
  on public.tender_entries (pair_id, user_id);

-- One payout per person per day per kind. This is what makes the payout
-- idempotent: submit_answer can be called twice, or a reveal recomputed, and
-- nobody gets paid twice.
create unique index if not exists tender_entries_one_daily_payout
  on public.tender_entries (pair_id, user_id, day_index, reason)
  where reason in ('reveal', 'solo');

-- One refund per purchase, ever.
create unique index if not exists tender_entries_one_refund
  on public.tender_entries (purchase_id)
  where reason = 'refund';


-- ----------------------------------------------------------------------------
-- Menus
--
-- You write and price only your own. Nobody can value your time but you, and a
-- partner who could set your prices could price you out of being asked.
-- ----------------------------------------------------------------------------

create table if not exists public.menu_items (
  id         uuid primary key default gen_random_uuid(),
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  -- The author, and the person expected to honour it.
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 2 and 90),
  -- Ceiling is 10x the daily cap: high enough to price something genuinely big,
  -- low enough that nothing on the menu is unreachable. An item nobody can ever
  -- afford is a way of refusing without saying so.
  price      int not null check (price between 1 and 600),
  -- Unlisted rather than deleted, so history keeps pointing at something real.
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_items_pair_owner_idx
  on public.menu_items (pair_id, owner_id) where active;

-- Price history, so "you raised it while I was saving" is checkable rather than
-- an argument. Written by the update trigger below.
create table if not exists public.menu_price_changes (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.menu_items (id) on delete cascade,
  pair_id    uuid not null references public.pairs (id) on delete cascade,
  old_price  int not null,
  new_price  int not null,
  changed_at timestamptz not null default now()
);

create index if not exists menu_price_changes_item_idx
  on public.menu_price_changes (item_id, changed_at desc);

create or replace function public.log_menu_price_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.price <> old.price then
    insert into public.menu_price_changes (item_id, pair_id, old_price, new_price)
    values (new.id, new.pair_id, old.price, new.price);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists menu_items_price_audit on public.menu_items;
create trigger menu_items_price_audit
  before update on public.menu_items
  for each row execute function public.log_menu_price_change();


-- ----------------------------------------------------------------------------
-- Purchases
--
-- A purchase is a REQUEST. The states say so:
--
--   requested  tender debited, the seller has been asked
--   fulfilled  the BUYER says it happened
--   declined   the seller said no; tender returned in full
--
-- The buyer marks fulfilled, never the seller — a seller who could close their
-- own tickets could mark something done that never happened, and the person with
-- no recourse would be the one who paid.
--
-- There is no expiry and no overdue state. A countdown on somebody's obligation
-- turns a gift into a debt, which is the exact thing this mechanic must not
-- become.
-- ----------------------------------------------------------------------------

create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  pair_id      uuid not null references public.pairs (id) on delete cascade,
  item_id      uuid not null references public.menu_items (id) on delete cascade,
  buyer_id     uuid not null references public.profiles (id) on delete cascade,
  seller_id    uuid not null references public.profiles (id) on delete cascade,
  -- Snapshotted: a later price change must not rewrite what was paid.
  title        text not null,
  price        int not null check (price > 0),
  status       text not null default 'requested'
                 check (status in ('requested', 'fulfilled', 'declined')),
  created_at   timestamptz not null default now(),
  fulfilled_at timestamptz,
  declined_at  timestamptz,
  check (buyer_id <> seller_id)
);

create index if not exists purchases_pair_idx on public.purchases (pair_id, created_at desc);


-- ----------------------------------------------------------------------------
-- RLS
--
-- Everything in the economy is shared knowledge within the pair — unlike
-- answers, there is nothing here to hide from a partner. You can see their menu
-- (that's the point), their balance, and every purchase either way.
--
-- Writes go through functions only. No table below grants INSERT, UPDATE or
-- DELETE, which is what makes the ledger append-only in practice rather than by
-- convention.
-- ----------------------------------------------------------------------------

alter table public.tender_entries     enable row level security;
alter table public.menu_items         enable row level security;
alter table public.menu_price_changes enable row level security;
alter table public.purchases          enable row level security;

drop policy if exists tender_entries_select on public.tender_entries;
create policy tender_entries_select on public.tender_entries
  for select using (public.is_pair_member(pair_id));

drop policy if exists menu_items_select on public.menu_items;
create policy menu_items_select on public.menu_items
  for select using (public.is_pair_member(pair_id));

drop policy if exists menu_price_changes_select on public.menu_price_changes;
create policy menu_price_changes_select on public.menu_price_changes
  for select using (public.is_pair_member(pair_id));

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases
  for select using (public.is_pair_member(pair_id));

grant select on public.tender_entries, public.menu_items,
                public.menu_price_changes, public.purchases to authenticated;


-- ----------------------------------------------------------------------------
-- Payout
--
-- Split, not a single accuracy number:
--
--   COMPLETION  15, flat, for both of you having shown up
--   ACCURACY    up to 45, scaled by the joint sync score
--   CAP         60
--
-- The flat portion exists because a couple who both turned up and read each
-- other badly should not earn nothing. A zero-payout day punishes the behaviour
-- the app is trying to build, and it makes a bad day feel like a penalty rather
-- than information.
--
-- Both partners always earn the SAME amount, from the couple's joint score.
-- Paying each person for their own accuracy would pay the more attuned partner
-- more and leave the struggling one unable to afford anything — punishing
-- precisely the person already having the harder time.
-- ----------------------------------------------------------------------------

create or replace function public.tender_completion() returns int
language sql immutable as $$ select 15 $$;

create or replace function public.tender_accuracy_max() returns int
language sql immutable as $$ select 45 $$;

create or replace function public.tender_daily_cap() returns int
language sql immutable as $$ select 60 $$;

create or replace function public.tender_payout_for_score(p_score int)
returns int
language sql
immutable
as $$
  select least(
    public.tender_daily_cap(),
    public.tender_completion()
      + round(public.tender_accuracy_max() * greatest(0, least(100, p_score)) / 100.0)::int
  )
$$;

/** Derived balance. Sums the ledger; there is no stored total to drift. */
create or replace function public.tender_balance(p_user_id uuid default null)
returns int
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(sum(amount), 0)::int
  from public.tender_entries
  where pair_id = public.current_pair_id()
    and user_id = coalesce(p_user_id, auth.uid())
$$;

/** Lifetime credits only. What the Rich List will rank on in Phase 5. */
create or replace function public.tender_earned(p_user_id uuid default null)
returns int
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(sum(amount), 0)::int
  from public.tender_entries
  where pair_id = public.current_pair_id()
    and user_id = coalesce(p_user_id, auth.uid())
    and amount > 0
    and reason in ('reveal', 'solo')
$$;

/**
 * Credits both wallets for a completed day. Idempotent via the unique index.
 * Called from submit_answer the moment a reveal is written.
 */
create or replace function public.pay_out_reveal(p_pair_id uuid, p_day_index int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_score  int;
  v_amount int;
  v_member record;
begin
  select sync_score into v_score
  from public.reveals
  where pair_id = p_pair_id and day_index = p_day_index;

  if v_score is null then
    return;
  end if;

  v_amount := public.tender_payout_for_score(v_score);

  for v_member in
    select user_id from public.pair_members
    where pair_id = p_pair_id and left_at is null
  loop
    insert into public.tender_entries (pair_id, user_id, amount, reason, day_index, detail)
    values (
      p_pair_id, v_member.user_id, v_amount, 'reveal', p_day_index,
      jsonb_build_object(
        'sync_score', v_score,
        'completion', public.tender_completion(),
        'accuracy', v_amount - public.tender_completion()
      )
    )
    on conflict do nothing;
  end loop;
end;
$$;

/**
 * The solo floor.
 *
 * Somebody who answered while their partner didn't still gets the completion
 * portion once the window has closed. Symmetric payout means a silent partner
 * would otherwise cost the person who showed up everything — punishing them for
 * somebody else's absence.
 *
 * Safe to call repeatedly; the unique index makes it idempotent, and it pays
 * nothing while the day is still open or if a reveal exists.
 */
create or replace function public.settle_open_days()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pair_id uuid := public.current_pair_id();
  v_paid    int := 0;
  v_row     record;
begin
  if v_pair_id is null then
    return 0;
  end if;

  for v_row in
    select a.user_id, a.day_index
    from public.answers a
    where a.pair_id = v_pair_id
      and not public.pair_day_is_open(v_pair_id, a.day_index)
      and not exists (
        select 1 from public.reveals r
        where r.pair_id = a.pair_id and r.day_index = a.day_index
      )
  loop
    insert into public.tender_entries (pair_id, user_id, amount, reason, day_index, detail)
    values (
      v_pair_id, v_row.user_id, public.tender_completion(), 'solo', v_row.day_index,
      jsonb_build_object('note', 'answered alone; window closed')
    )
    on conflict do nothing;

    if found then
      v_paid := v_paid + 1;
    end if;
  end loop;

  return v_paid;
end;
$$;

grant execute on function public.tender_balance(uuid)          to authenticated;
grant execute on function public.tender_earned(uuid)           to authenticated;
grant execute on function public.tender_payout_for_score(int)  to authenticated;
grant execute on function public.tender_daily_cap()            to authenticated;
grant execute on function public.settle_open_days()            to authenticated;


-- ----------------------------------------------------------------------------
-- Menu writing
--
-- Every one of these checks that the caller owns the item. You cannot write,
-- price, or unlist anything on your partner's menu.
-- ----------------------------------------------------------------------------

create or replace function public.upsert_menu_item(
  p_item_id uuid,
  p_title   text,
  p_price   int
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid := public.current_pair_id();
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;

  p_title := btrim(coalesce(p_title, ''));
  if char_length(p_title) < 2 then
    raise exception 'Give it a name.' using errcode = '22023';
  end if;
  if p_price is null or p_price < 1 or p_price > 600 then
    raise exception 'Price must be between T1 and T600.' using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.menu_items (pair_id, owner_id, title, price)
    values (v_pair_id, v_user, p_title, p_price)
    returning id into v_id;
    return v_id;
  end if;

  update public.menu_items
  set title = p_title, price = p_price
  where id = p_item_id and owner_id = v_user and pair_id = v_pair_id
  returning id into v_id;

  if v_id is null then
    raise exception 'That is not your item to change.' using errcode = '42501';
  end if;

  return v_id;
end;
$$;

/**
 * Unlist, or relist.
 *
 * Deliberately available even for an item with an outstanding purchase — a
 * seller must be able to withdraw consent at any point. Any money already taken
 * is refunded by decline_purchase, which is a separate, explicit act.
 */
create or replace function public.set_menu_item_active(p_item_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_hit  uuid;
begin
  update public.menu_items
  set active = coalesce(p_active, true)
  where id = p_item_id and owner_id = v_user and pair_id = public.current_pair_id()
  returning id into v_hit;

  if v_hit is null then
    raise exception 'That is not your item to change.' using errcode = '42501';
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- Buying
-- ----------------------------------------------------------------------------

/**
 * Buy an item from the partner's menu.
 *
 * Two gates, both deliberate:
 *
 *   A confirmed email. Spending is consequential and an anonymous session can't
 *   prove whose it is.
 *
 *   Three items on your own menu. This is what stops the one-sided economy where
 *   somebody accumulates and spends while never offering anything back — and it
 *   lands on day two or three, exactly where the itch of holding unspendable
 *   tender does the motivating, rather than as homework at signup.
 */
create or replace function public.buy_menu_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  v_pair_id   uuid := public.current_pair_id();
  v_item      public.menu_items;
  v_own_count int;
  v_balance   int;
  v_purchase  uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if v_pair_id is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;
  if not public.is_claimed() then
    raise exception 'Add your email before spending.' using errcode = 'P0012';
  end if;

  select count(*) into v_own_count
  from public.menu_items
  where pair_id = v_pair_id and owner_id = v_user and active;

  if v_own_count < 3 then
    raise exception 'Write three things on your own menu first.' using errcode = 'P0013';
  end if;

  select * into v_item
  from public.menu_items
  where id = p_item_id and pair_id = v_pair_id
  for update;

  if v_item.id is null then
    raise exception 'That item is gone.' using errcode = 'P0002';
  end if;
  if v_item.owner_id = v_user then
    raise exception 'That is your own menu.' using errcode = 'P0014';
  end if;
  if not v_item.active then
    raise exception 'That is not available right now.' using errcode = 'P0015';
  end if;

  v_balance := public.tender_balance(v_user);
  if v_balance < v_item.price then
    raise exception 'Not enough tender — you have T%.', v_balance using errcode = 'P0016';
  end if;

  insert into public.purchases (pair_id, item_id, buyer_id, seller_id, title, price)
  values (v_pair_id, v_item.id, v_user, v_item.owner_id, v_item.title, v_item.price)
  returning id into v_purchase;

  insert into public.tender_entries (pair_id, user_id, amount, reason, purchase_id, detail)
  values (
    v_pair_id, v_user, -v_item.price, 'purchase', v_purchase,
    jsonb_build_object('title', v_item.title)
  );

  return jsonb_build_object('purchase_id', v_purchase, 'price', v_item.price);
end;
$$;

/**
 * The buyer confirms it happened.
 *
 * Only the buyer. A seller who could close their own tickets could mark
 * something done that never was, and the person left with no recourse would be
 * the one who paid for it.
 */
create or replace function public.mark_purchase_fulfilled(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hit uuid;
begin
  update public.purchases
  set status = 'fulfilled', fulfilled_at = now()
  where id = p_purchase_id
    and buyer_id = auth.uid()
    and status = 'requested'
  returning id into v_hit;

  if v_hit is null then
    raise exception 'Only the person who bought it can mark it done.' using errcode = '42501';
  end if;
end;
$$;

/**
 * The seller says no, and the tender goes back in full.
 *
 * No reason required, no limit, no cooling-off. This function is the reason the
 * whole mechanic is safe: it is what makes tender a nudge rather than a
 * contract, and it means "you already paid" can never be an argument that
 * obliges anybody to do anything.
 */
create or replace function public.decline_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase public.purchases;
begin
  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if v_purchase.id is null then
    raise exception 'No such purchase.' using errcode = 'P0002';
  end if;

  -- Either side can cancel. The seller declining is the important case, but a
  -- buyer who asked for the wrong thing shouldn't need to beg for a reversal.
  if auth.uid() not in (v_purchase.seller_id, v_purchase.buyer_id) then
    raise exception 'Not yours to cancel.' using errcode = '42501';
  end if;
  if v_purchase.status <> 'requested' then
    raise exception 'That one is already settled.' using errcode = 'P0017';
  end if;

  update public.purchases
  set status = 'declined', declined_at = now()
  where id = v_purchase.id;

  insert into public.tender_entries (pair_id, user_id, amount, reason, purchase_id, detail)
  values (
    v_purchase.pair_id, v_purchase.buyer_id, v_purchase.price, 'refund', v_purchase.id,
    jsonb_build_object(
      'title', v_purchase.title,
      'declined_by', case when auth.uid() = v_purchase.seller_id then 'seller' else 'buyer' end
    )
  );
end;
$$;

grant execute on function public.upsert_menu_item(uuid, text, int)   to authenticated;
grant execute on function public.set_menu_item_active(uuid, boolean) to authenticated;
grant execute on function public.buy_menu_item(uuid)                 to authenticated;
grant execute on function public.mark_purchase_fulfilled(uuid)       to authenticated;
grant execute on function public.decline_purchase(uuid)              to authenticated;


-- ----------------------------------------------------------------------------
-- Neutral scoring, mirrored from src/lib/sync/score.ts
--
-- An option flagged `neutral` in the facet json is an honest non-answer — "I
-- truly don't mind". Matching on one scores half.
--
-- Those options must exist, because forcing somebody to invent a feeling is
-- worse than letting them pass. But at full marks a mutual shrug would be the
-- highest-scoring day the app can produce, and now that accuracy pays, that is
-- an economy that pays best for revealing least.
-- ----------------------------------------------------------------------------

create or replace function public.score_facet(
  p_kind    text,
  p_truth   jsonb,
  p_guess   jsonb,
  p_options jsonb default null
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_t numeric;
  v_g numeric;
begin
  if p_truth is null or p_guess is null
     or jsonb_typeof(p_truth) = 'null' or jsonb_typeof(p_guess) = 'null' then
    return 0;
  end if;

  if p_kind = 'choice' then
    if p_truth <> p_guess then
      return 0;
    end if;
    if p_options is not null and exists (
      select 1
      from jsonb_array_elements(p_options) o
      where o -> 'id' = p_truth
        and coalesce((o ->> 'neutral')::boolean, false)
    ) then
      return 50;
    end if;
    return 100;
  end if;

  begin
    v_t := least(100, greatest(0, round((p_truth #>> '{}')::numeric)));
    v_g := least(100, greatest(0, round((p_guess #>> '{}')::numeric)));
  exception when others then
    return 0;
  end;

  return greatest(0, 100 - 2 * abs(v_t - v_g));
end;
$$;

create or replace function public.score_direction(
  p_facets jsonb,
  p_truth  jsonb,
  p_guess  jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_facet  jsonb;
  v_id     text;
  v_kind   text;
  v_score  numeric;
  v_sum    numeric := 0;
  v_n      int := 0;
  v_detail jsonb := '[]'::jsonb;
begin
  for v_facet in select * from jsonb_array_elements(p_facets) loop
    v_id   := v_facet ->> 'id';
    v_kind := v_facet ->> 'kind';
    v_score := public.score_facet(
      v_kind, p_truth -> v_id, p_guess -> v_id, v_facet -> 'options'
    );

    v_sum := v_sum + v_score;
    v_n := v_n + 1;
    v_detail := v_detail || jsonb_build_object(
      'facetId', v_id,
      'kind', v_kind,
      'score', v_score::int,
      'truth', p_truth -> v_id,
      'guess', p_guess -> v_id
    );
  end loop;

  return jsonb_build_object(
    'total', case when v_n = 0 then 0 else round(v_sum / v_n)::int end,
    'facets', v_detail
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- question_for_day, now renewable-aware
--
-- First pass walks the sequence in order, ramp intact. After that it cycles the
-- renewable subset only.
-- ----------------------------------------------------------------------------

create or replace function public.question_for_day(p_day_index int)
returns public.questions
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_total     int;
  v_renewable int;
  v_day       int := greatest(0, p_day_index);
  v_row       public.questions;
begin
  select count(*) into v_total
  from public.questions where sequence_position is not null;

  if v_total = 0 then
    raise exception 'question bank is empty — run: npm run seed:questions';
  end if;

  if v_day < v_total then
    select * into v_row
    from public.questions
    where sequence_position = v_day;
    return v_row;
  end if;

  select count(*) into v_renewable
  from public.questions where sequence_position is not null and renewable;

  if v_renewable = 0 then
    -- Shouldn't happen, but falling back to the ramp beats returning nothing.
    select * into v_row from public.questions
    where sequence_position = v_day % v_total;
    return v_row;
  end if;

  select * into v_row
  from public.questions
  where sequence_position is not null and renewable
  order by sequence_position
  offset (v_day - v_total) % v_renewable
  limit 1;

  return v_row;
end;
$$;


-- ----------------------------------------------------------------------------
-- submit_answer now pays out.
--
-- One added line at the end of the reveal branch. Kept inside the same function
-- so the reveal and the payment are one transaction: there is no window in which
-- a reveal exists unpaid, or tender exists for a reveal that didn't.
-- ----------------------------------------------------------------------------

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

  v_question := public.question_for_day(p_day_index);

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
