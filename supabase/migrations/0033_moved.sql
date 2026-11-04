-- ============================================================================
-- Sync in Love has moved
--
-- On moving day the founder runs, in the SQL editor:
--
--   select public.set_moved('https://syncin.love');
--
-- and from that moment this app is read-only: nobody signed in can write
-- anything, reminders and letter nudges stop, and every page shows a banner
-- pointing at the new app. Everything already here stays readable, so people
-- can still look back and export until the old database is wiped.
--
-- To undo (if the move has to stop and this app reopens):
--
--   select public.set_moved(null);
--
-- WHY A TRIGGER AND NOT A CHECK IN EACH FUNCTION
--
-- Writes reach these tables from three dozen SECURITY DEFINER functions and a
-- server action. A check in each would be three dozen places to miss one. A
-- trigger on each table catches every path, and it tells the person apart from
-- the database's own jobs by the request's JWT role: inside a definer function
-- current_user is the owner, but auth.role() is still whoever asked.
-- ============================================================================

-- Where Sync in Love lives now, or null while this app is the live one.
create or replace function public.moved_to()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(value, '') from public.private_config where name = 'moved_to';
$$;

grant execute on function public.moved_to() to anon, authenticated;

create or replace function public.set_moved(p_url text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_url is not null and p_url !~ '^https://' then
    raise exception 'the new address must start with https://';
  end if;
  insert into public.private_config (name, value, updated_at)
  values ('moved_to', coalesce(p_url, ''), now())
  on conflict (name) do update set value = excluded.value, updated_at = excluded.updated_at;
  return public.moved_to();
end;
$$;

revoke all on function public.set_moved(text) from public, anon, authenticated;

create or replace function public.refuse_when_moved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.moved_to() is not null and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Sync in Love has moved to %', public.moved_to() using errcode = 'P0099';
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'pairs', 'pair_members', 'invites', 'pair_days', 'answers', 'reveals',
                           'streak_freezes', 'tender_entries', 'tender_marks', 'menu_items', 'menu_price_changes',
                           'purchases', 'letters', 'notifications', 'push_subscriptions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_moved', t);
    execute format('create trigger %I before insert or update or delete on public.%I
                    for each statement execute function public.refuse_when_moved()', t || '_moved', t);
  end loop;
end;
$$;

-- No reminders or letter nudges from an app nobody can answer in. The cron job
-- calls send_nudges() by name, so the live body moves aside and this stands in.
alter function public.send_nudges() rename to send_nudges_while_live;

create function public.send_nudges()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.moved_to() is not null then
    return 0;
  end if;
  return public.send_nudges_while_live();
end;
$$;

revoke all on function public.send_nudges(), public.send_nudges_while_live() from public, anon, authenticated;
