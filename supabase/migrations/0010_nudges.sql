-- ============================================================================
-- Nudges.
--
-- Until now this app had no scheduler and no notification of any kind — the
-- comment in page.tsx said so outright, "a page load is the only trigger". So a
-- couple who forgot lost the day in silence, a streak worth up to T300,000 broke
-- with no warning, and when your partner answered you found out only by opening
-- the app again on the off chance.
--
-- WHY THIS LIVES ENTIRELY IN THE DATABASE
--
-- Sending mail needs two things the app deliberately cannot have: every user's
-- email address, and the ability to read across pairs. This app has no
-- service_role key anywhere, on purpose — there is no code path, buggy or
-- otherwise, that can read a partner's un-revealed answer. Handing the web app a
-- privileged key to send reminders would throw that away for a feature that does
-- not need it.
--
-- So the decision engine is SQL, the send is pg_net called from pg_cron, and
-- addresses never leave Postgres. nudge_queue returns emails and is therefore
-- revoked from PUBLIC — the same treatment rich_list_rows gets, for the same
-- reason.
--
-- WHAT IS TESTED AND WHAT IS NOT
--
-- Everything that decides WHO gets a nudge is plain SQL and has assertions in
-- supabase/tests/phase5_rich_list.sql. The HTTP call itself is four lines and
-- cannot be exercised without pg_net, which is not present in the throwaway test
-- cluster. That split is deliberate: the part that can be wrong in an interesting
-- way is the part that is covered.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Preferences
--
-- Three switches rather than one. "All or nothing" makes people turn the lot off
-- because one of them annoyed them, and the one that annoys is rarely the one
-- that mattered.
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists notify_reminders boolean not null default true,
  add column if not exists notify_partner   boolean not null default true,
  add column if not exists notify_requests  boolean not null default true;

comment on column public.profiles.notify_reminders is
  'Today''s question is still unanswered and the window is closing.';
comment on column public.profiles.notify_partner is
  'Your partner has answered and is waiting on you.';
comment on column public.profiles.notify_requests is
  'Somebody asked for something from your menu.';


-- ----------------------------------------------------------------------------
-- What has already been sent
--
-- The unique index is the whole idempotency story. The cron job may run every
-- hour, may overlap itself, may be retried after a failure — and none of that can
-- produce a second copy of the same nudge, because the insert is what claims the
-- right to send.
-- ----------------------------------------------------------------------------

create table if not exists public.notifications (
  id        uuid primary key default gen_random_uuid(),
  pair_id   uuid not null references public.pairs (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  kind      text not null check (kind in ('closing_soon', 'partner_answered', 'request')),
  /** The day this concerns. Null for things not tied to a day. */
  day_index int,
  /** Set once the send succeeded, so a failure can be retried. */
  sent_at   timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_once
  on public.notifications (pair_id, user_id, kind, coalesce(day_index, -1));

create index if not exists notifications_unsent_idx
  on public.notifications (created_at) where sent_at is null;

alter table public.notifications enable row level security;

-- Readable by the person it is about, so a settings screen could show it.
-- No insert, update or delete policy: only the SECURITY DEFINER functions below
-- write here.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());


-- ----------------------------------------------------------------------------
-- Who needs telling
-- ----------------------------------------------------------------------------

/**
 * Everyone owed a nudge right now, with the address to send it to.
 *
 * `p_evening_hour` is the pair-local hour after which "the window is closing" is
 * a fair thing to say. Each pair keeps its own timezone, so this is evaluated per
 * pair rather than against one global clock — the entire reason the job can run
 * hourly and still only ever mail people in their own evening.
 *
 * Three rules, each requiring the recipient to have switched that kind on, to
 * have a confirmed address to send to, and to be in a live two-person pairing:
 *
 *   partner_answered  they submitted today, you have not, nothing revealed yet.
 *                     The highest-value one: somebody is actually waiting.
 *   closing_soon      you have not answered, and it is late where the pair lives.
 *   request           an unfulfilled thing off your menu that you have not been
 *                     told about.
 *
 * Anything already recorded in notifications is excluded, so this returns work
 * that has genuinely never been sent.
 */
create or replace function public.nudge_queue(p_evening_hour int default 20)
returns table (
  pair_id    uuid,
  user_id    uuid,
  email      text,
  first_name text,
  kind       text,
  day_index  int,
  partner_first_name text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with live as (
    select
      p.id as pair_id,
      p.time_zone,
      p.day_zero,
      public.pair_day_index(p.id) as today,
      extract(hour from (now() at time zone p.time_zone))::int as local_hour
    from public.pairs p
    where p.status <> 'ended'
      and (select count(*) from public.pair_members pm
           where pm.pair_id = p.id and pm.left_at is null) = 2
  ),
  people as (
    select
      l.*,
      pm.user_id,
      pr.first_name,
      pr.notify_reminders,
      pr.notify_partner,
      pr.notify_requests,
      u.email,
      -- The other half of the pairing.
      (select pm2.user_id from public.pair_members pm2
        where pm2.pair_id = l.pair_id and pm2.user_id <> pm.user_id
          and pm2.left_at is null limit 1) as partner_id
    from live l
    join public.pair_members pm on pm.pair_id = l.pair_id and pm.left_at is null
    join public.profiles pr on pr.id = pm.user_id
    join auth.users u on u.id = pm.user_id
    -- No address, nothing to send to. An unconfirmed account has none.
    where u.email is not null
      and u.email <> ''
  ),
  state as (
    select
      pe.*,
      (select true from public.answers a
        where a.pair_id = pe.pair_id and a.user_id = pe.user_id
          and a.day_index = pe.today limit 1) as i_answered,
      (select true from public.answers a
        where a.pair_id = pe.pair_id and a.user_id = pe.partner_id
          and a.day_index = pe.today limit 1) as they_answered,
      (select true from public.reveals r
        where r.pair_id = pe.pair_id and r.day_index = pe.today limit 1) as revealed,
      (select pr2.first_name from public.profiles pr2 where pr2.id = pe.partner_id)
        as partner_first_name
    from people pe
  ),
  candidates as (
    -- They answered, you have not, and it is still sealed.
    select s.pair_id, s.user_id, s.email, s.first_name,
           'partner_answered'::text as kind, s.today as day_index, s.partner_first_name
    from state s
    where s.notify_partner
      and coalesce(s.they_answered, false)
      and not coalesce(s.i_answered, false)
      and not coalesce(s.revealed, false)

    union all

    -- Late where the pair lives, and you still have not answered.
    select s.pair_id, s.user_id, s.email, s.first_name,
           'closing_soon', s.today, s.partner_first_name
    from state s
    where s.notify_reminders
      and s.local_hour >= p_evening_hour
      and not coalesce(s.i_answered, false)

    union all

    -- Somebody asked for something off your menu and is waiting on you.
    select distinct s.pair_id, s.user_id, s.email, s.first_name,
           'request', null::int, s.partner_first_name
    from state s
    join public.purchases pu
      on pu.pair_id = s.pair_id
     and pu.seller_id = s.user_id
     and pu.status = 'requested'
    where s.notify_requests
  )
  select c.pair_id, c.user_id, c.email, c.first_name, c.kind, c.day_index,
         c.partner_first_name
  from candidates c
  where not exists (
    select 1 from public.notifications n
    where n.pair_id = c.pair_id
      and n.user_id = c.user_id
      and n.kind = c.kind
      and coalesce(n.day_index, -1) = coalesce(c.day_index, -1)
  )
$$;

-- Returns email addresses across every pairing, so it is for the cron job and
-- nothing else. Revoked from PUBLIC specifically: Postgres grants EXECUTE to
-- PUBLIC on every new function, and revoking only the named roles would leave
-- this reachable over the API.
revoke all on function public.nudge_queue(int) from public;
revoke all on function public.nudge_queue(int) from authenticated, anon;


/**
 * Claim the right to send one nudge.
 *
 * Returns true if this call won the race and should send, false if it was already
 * claimed. The unique index does the arbitration, so two overlapping cron runs
 * cannot both decide to mail the same person.
 */
create or replace function public.claim_nudge(
  p_pair_id   uuid,
  p_user_id   uuid,
  p_kind      text,
  p_day_index int
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (pair_id, user_id, kind, day_index)
  values (p_pair_id, p_user_id, p_kind, p_day_index);
  return true;
exception when unique_violation then
  return false;
end;
$$;

revoke all on function public.claim_nudge(uuid, uuid, text, int) from public;
revoke all on function public.claim_nudge(uuid, uuid, text, int) from authenticated, anon;


/** Mark a claimed nudge as actually delivered. */
create or replace function public.mark_nudge_sent(
  p_pair_id   uuid,
  p_user_id   uuid,
  p_kind      text,
  p_day_index int
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications
  set sent_at = now()
  where pair_id = p_pair_id
    and user_id = p_user_id
    and kind = p_kind
    and coalesce(day_index, -1) = coalesce(p_day_index, -1)
$$;

revoke all on function public.mark_nudge_sent(uuid, uuid, text, int) from public;
revoke all on function public.mark_nudge_sent(uuid, uuid, text, int) from authenticated, anon;


/** Let people turn each kind on and off. This one IS for the app. */
create or replace function public.update_notify_prefs(
  p_reminders boolean,
  p_partner   boolean,
  p_requests  boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  update public.profiles
  set notify_reminders = coalesce(p_reminders, notify_reminders),
      notify_partner   = coalesce(p_partner, notify_partner),
      notify_requests  = coalesce(p_requests, notify_requests)
  where id = v_user;
end;
$$;

grant execute on function public.update_notify_prefs(boolean, boolean, boolean) to authenticated;
