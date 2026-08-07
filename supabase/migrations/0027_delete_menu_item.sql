-- ============================================================================
-- Taking something off your menu removes it
--
-- "Unlist" set active = false and left the row there, greyed out, forever. The schema
-- says why: "Unlisted rather than deleted, so history keeps pointing at something
-- real." That reasoning was sound when it was written and is no longer true, because
-- purchases snapshot what they need:
--
--   title  text not null   -- Snapshotted: a later price change must not rewrite
--   price  int  not null   -- what was paid.
--
-- Nothing joins a purchase back to its menu item. Checked rather than assumed — no
-- function, view or query in this schema or in TypeScript reads purchases.item_id
-- after the row is written. The link exists only as a foreign key.
--
-- WHAT MADE A DELETE UNSAFE, AND WHAT FIXES IT
--
-- purchases.item_id was `on delete cascade`. Deleting a menu item therefore deleted
-- every purchase of it — including asks still sitting at status 'requested', which is
-- where held tender lives. Somebody tidying their menu would have silently destroyed
-- their partner's outstanding ask and stranded the tender held against it. The money
-- had already left the buyer's balance; the row releasing it would have been gone.
--
-- So the cascade becomes `set null`. The purchase keeps its title, its price, its
-- status and its money, and simply stops pointing at a menu item that no longer
-- exists. A pending ask survives a deletion and can still be fulfilled or declined,
-- which is the behaviour that matters: the ask is a promise between two people, not a
-- pointer into a list.
--
-- menu_price_changes keeps cascading. "Was T50" for an item that no longer exists is
-- not history worth keeping — it is a footnote about a thing nobody can ask for.
--
-- WHAT IS DELIBERATELY KEPT
--
-- set_menu_item_active stays. Rows already unlisted exist in production, and an owner
-- may still want to take something down temporarily rather than for good. What changes
-- is which one the button in front of them does.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A purchase can outlive the thing it was for
-- ----------------------------------------------------------------------------

alter table public.purchases alter column item_id drop not null;

alter table public.purchases drop constraint if exists purchases_item_id_fkey;

alter table public.purchases
  add constraint purchases_item_id_fkey
  foreign key (item_id) references public.menu_items (id) on delete set null;

comment on column public.purchases.item_id is
  'The menu item asked for, or null once the owner has removed it. Nothing reads this '
  'after the purchase is written — title and price are snapshotted on the row — so a '
  'removed item costs no history and no money.';


-- ----------------------------------------------------------------------------
-- Removing an item
--
-- Owner only, and scoped to the caller's own pairing. Both halves matter: owner_id
-- stops somebody deleting their partner's menu, and pair_id stops a stale id from a
-- previous pairing reaching into a current one.
--
-- Returns the number of rows removed rather than void, so the caller can tell "deleted"
-- from "that was not yours" without a second query.
-- ----------------------------------------------------------------------------

create or replace function public.delete_menu_item(p_item_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_pair uuid := public.current_pair_id();
  v_gone int;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  if v_pair is null then
    raise exception 'No active pairing.' using errcode = 'P0002';
  end if;

  delete from public.menu_items
  where id = p_item_id
    and owner_id = v_user
    and pair_id = v_pair;

  get diagnostics v_gone = row_count;
  return v_gone;
end;
$$;

comment on function public.delete_menu_item(uuid) is
  'Remove one of your own menu items for good. Asks already made survive with their '
  'title and price intact, and any tender held against them still resolves when the '
  'ask is fulfilled or declined.';

revoke all on function public.delete_menu_item(uuid) from public;
revoke all on function public.delete_menu_item(uuid) from anon;
grant execute on function public.delete_menu_item(uuid) to authenticated;
