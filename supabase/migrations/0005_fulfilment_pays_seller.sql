-- ============================================================================
-- Sync — honouring a request pays the person who honoured it
--
-- Run after 0004_revoke_clears_economy.sql.
--
-- WHAT CHANGES
--
-- Until now a purchase destroyed the tender: the buyer was debited and nobody
-- was credited. Now the amount sits against the purchase until it settles, and
-- then moves:
--
--   fulfilled  the buyer confirms it happened -> the SELLER is credited
--   declined   the seller says no             -> the BUYER is refunded
--   neither    nothing moves; it stays held against the purchase
--
-- WHY
--
-- The payout is symmetric — both partners earn the same amount from the same
-- joint score — so there is no individual lever there. You cannot out-earn your
-- partner by trying harder, only read each other better, together. That is
-- deliberate: paying each person for their own accuracy would leave the less
-- attuned partner unable to afford anything.
--
-- Transfers add the individual lever, and it is the right one: generosity. Being
-- good to somebody becomes its own way to afford asking things of them, which is
-- how favours work between people who like each other. It also fixes a real
-- asymmetry — under a pure sink a heavy asker runs dry while a giving partner
-- accumulates tender they cannot use, because the person they would spend it on
-- has none left to be asked for.
--
-- ON FULFILMENT RATHER THAN ON PURCHASE
--
-- Paying at the moment of asking would pay for care merely requested. Paying at
-- fulfilment ties the money to care actually delivered. It also means declining
-- never has to claw back tender the seller may already have spent — the amount
-- was never theirs until they did the thing.
--
-- The buyer still marks fulfilment, never the seller, so nobody can close their
-- own ticket. A buyer who refuses to confirm withholds payment for work that was
-- done — but their own tender is already gone either way, so they gain nothing by
-- it, and the seller can always decline to close the request out. Visibility
-- handles the rest, as it does everywhere else here.
--
-- WHAT DOESN'T CHANGE
--
-- tender_earned still counts only payouts and streak bonuses. If transfers
-- counted, a couple could pass the same amount back and forth indefinitely and
-- both appear as billionaires. The Rich List measures attention; your balance
-- reflects generosity.
-- ============================================================================

alter table public.tender_entries drop constraint if exists tender_entries_reason_check;
alter table public.tender_entries add constraint tender_entries_reason_check
  check (reason in (
    'reveal', 'solo', 'purchase', 'refund', 'streak', 'fulfilled', 'adjustment'
  ));

-- One credit per purchase, ever. Together with the existing one-refund index this
-- makes a purchase's money movable exactly once: paid out or given back, never
-- both and never twice.
create unique index if not exists tender_entries_one_fulfilment
  on public.tender_entries (purchase_id)
  where reason = 'fulfilled';

/**
 * The buyer confirms it happened, and the seller is paid.
 *
 * Only the buyer can call this. A seller able to close their own ticket could
 * mark something done that never was and pay themselves for it — and the person
 * left with no recourse would be the one who paid.
 */
create or replace function public.mark_purchase_fulfilled(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase public.purchases;
begin
  update public.purchases
  set status = 'fulfilled', fulfilled_at = now()
  where id = p_purchase_id
    and buyer_id = auth.uid()
    and status = 'requested'
  returning * into v_purchase;

  if v_purchase.id is null then
    raise exception 'Only the person who bought it can mark it done.' using errcode = '42501';
  end if;

  -- The tender reaches the seller now, not when it was asked for.
  insert into public.tender_entries
    (pair_id, user_id, amount, reason, purchase_id, detail)
  values (
    v_purchase.pair_id, v_purchase.seller_id, v_purchase.price, 'fulfilled', v_purchase.id,
    jsonb_build_object('title', v_purchase.title, 'from', v_purchase.buyer_id)
  )
  on conflict do nothing;
end;
$$;

/**
 * Tender received for honouring requests, as distinct from tender earned by
 * reading your partner. Shown separately because they mean different things.
 */
create or replace function public.tender_received(p_user_id uuid default null)
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
    and reason = 'fulfilled'
$$;

/** Tender currently held against unsettled requests, from the buyer's side. */
create or replace function public.tender_held()
returns int
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(sum(price), 0)::int
  from public.purchases
  where pair_id = public.current_pair_id()
    and buyer_id = auth.uid()
    and status = 'requested'
$$;

grant execute on function public.tender_received(uuid) to authenticated;
grant execute on function public.tender_held()         to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill
--
-- Any purchase already marked fulfilled under the old behaviour never paid its
-- seller. Credit them now, so the ledger reads consistently rather than having a
-- silent regime change in the middle of it.
-- ----------------------------------------------------------------------------

do $$
declare
  v_row     record;
  v_paid    int := 0;
begin
  for v_row in
    select p.* from public.purchases p
    where p.status = 'fulfilled'
      and not exists (
        select 1 from public.tender_entries e
        where e.purchase_id = p.id and e.reason = 'fulfilled'
      )
  loop
    insert into public.tender_entries
      (pair_id, user_id, amount, reason, purchase_id, detail)
    values (
      v_row.pair_id, v_row.seller_id, v_row.price, 'fulfilled', v_row.id,
      jsonb_build_object('title', v_row.title, 'backfilled', true)
    )
    on conflict do nothing;
    v_paid := v_paid + 1;
  end loop;

  if v_paid > 0 then
    raise notice 'backfilled % fulfilled purchase(s) that never paid their seller', v_paid;
  else
    raise notice 'no fulfilled purchases needed backfilling';
  end if;
end $$;
