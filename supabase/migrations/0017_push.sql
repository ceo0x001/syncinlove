-- ============================================================================
-- Web push
--
-- Email is a poor fit for a thirty-second daily ritual. It arrives late, gets
-- filtered, and nobody opens it on the walk home. Push is the notification this
-- app actually needed.
--
-- The awkward part is signing. Web push requires a VAPID JWT signed with ECDSA
-- P-256, which Postgres cannot do — pgcrypto has no ECDSA signing — so unlike the
-- Resend calls, this cannot be a straight pg_net POST to the push service.
--
-- It would be easy to solve that by giving a Next.js route a service_role key and
-- letting it read the queue. That is exactly the thing this project does not do.
-- A service_role key can read every un-revealed answer in the database, and "no
-- code path can read your partner's answer before you have answered" is the
-- product, not a feature of it.
--
-- So the decision stays where it already is. Postgres decides who gets notified
-- and what it says, exactly as it does for email, and then hands the finished
-- message plus the subscription to a relay whose entire job is to sign and
-- forward. The relay holds the VAPID private key and a shared secret. It holds no
-- database credentials, has no query interface, and cannot ask the database
-- anything — if it were fully compromised, the attacker would gain the ability to
-- send push messages to people who had already opted into receiving them, and
-- nothing else.
--
-- Payloads carry no content. Not a question, not an answer, not a letter's title.
-- A lock screen is a public surface and this app is read over shoulders by
-- design.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Subscriptions
--
-- One row per browser, not per person: somebody with a phone and a laptop has
-- two, and revoking one must not silence the other. The endpoint is the natural
-- key — the push service issues it and it is unique by construction.
-- ----------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique,
  -- The subscription's own keypair, used by the relay to encrypt the payload.
  -- Useless without the endpoint and harmless on their own.
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when the push service tells us the endpoint is dead (404/410). Kept
  -- rather than deleted so a device that unsubscribes and resubscribes does not
  -- silently accumulate rows, and so a broken send is diagnosable after the fact.
  failed_at    timestamptz,
  failed_code  int
);

create index if not exists push_subscriptions_user
  on public.push_subscriptions (user_id)
  where failed_at is null;

alter table public.push_subscriptions enable row level security;

-- Your own devices, and only ever your own. There is no policy that lets one
-- partner see the other's — a subscription endpoint reveals which browser and
-- roughly which device somebody uses, which is nobody else's business.
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own
  on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The grants RLS needs to mean anything.
--
-- Easy to leave out, and the omission is invisible until a real session tries.
-- RLS narrows which rows a role may touch; it does not grant the privilege to
-- touch the table in the first place, and save_push_subscription is SECURITY
-- INVOKER — deliberately, so the policy above is what enforces ownership rather
-- than a definer function's own logic. Without these, every signed-in user got
-- "permission denied for table push_subscriptions" and no device could ever
-- register, while every test that happened to run as the table owner passed.
--
-- No delete for anon and no grants to anon at all: registering a device requires a
-- uid to attach it to.
grant select, insert, update, delete on public.push_subscriptions to authenticated;


-- ----------------------------------------------------------------------------
-- Registering a device
--
-- An upsert, because browsers hand back the same endpoint on every load once
-- permission is granted. Without it, every page view would insert a row and one
-- nudge would arrive fifty times.
--
-- Re-registering also clears failed_at: a subscription the push service rejected
-- last week may be alive again after a browser update, and the device asking to
-- be registered is the best possible evidence of that.
-- ----------------------------------------------------------------------------

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  if coalesce(btrim(p_endpoint), '') = ''
     or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth), '') = '' then
    raise exception 'Incomplete subscription.' using errcode = '22023';
  end if;

  -- A push endpoint is always an https URL belonging to the browser vendor. This
  -- does not authenticate it, but it stops the table becoming somewhere to park
  -- arbitrary strings that a relay would later be asked to POST to.
  if p_endpoint !~ '^https://' then
    raise exception 'Not a push endpoint.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_user, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth))
  on conflict (endpoint) do update
    set user_id      = v_user,
        p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        last_seen_at = now(),
        failed_at    = null,
        failed_code  = null;
end;
$$;

-- Every new function carries an implicit EXECUTE grant to PUBLIC, and granting to
-- a named role does not displace it. This project has been caught by that once
-- already (rich_list_rows), so each function gets the explicit revoke first.
revoke all on function public.save_push_subscription(text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;


create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.delete_push_subscription(text) to authenticated;


/**
 * Does this account have a live device? Used by Settings to say so honestly.
 *
 * Counts only this user's rows, so it cannot be used to probe anybody else.
 */
create or replace function public.my_push_devices()
returns int
language sql
security invoker
set search_path = public, pg_temp
stable
as $$
  select count(*)::int
  from public.push_subscriptions
  where user_id = auth.uid() and failed_at is null;
$$;

revoke all on function public.my_push_devices() from public;
grant execute on function public.my_push_devices() to authenticated;


-- ----------------------------------------------------------------------------
-- Retiring a dead endpoint
--
-- Called by the relay, which is the only party that learns an endpoint is gone.
-- Takes the shared secret rather than a session, because the relay has no
-- session; it is checked against private_config, which has RLS on and no
-- policies, so this is unreachable from the API even with the secret in hand
-- unless it is granted below.
-- ----------------------------------------------------------------------------

create or replace function public.retire_push_endpoint(
  p_secret   text,
  p_endpoint text,
  p_code     int
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret text;
begin
  select value into v_secret from public.private_config where name = 'push_relay_secret';

  -- Constant-time-ish: both sides are short and this is not a rate-limited public
  -- endpoint, but comparing with = on a null secret must fail closed.
  if v_secret is null or v_secret = '' or p_secret is null or p_secret <> v_secret then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  update public.push_subscriptions
  set failed_at = now(), failed_code = p_code
  where endpoint = p_endpoint;
end;
$$;

-- Reachable with the anon key and useless without the secret.
--
-- The relay has no session — it is a server process, not a signed-in user — so
-- PostgREST reaches this as `anon`. That looks alarming until you read the body:
-- it compares the presented secret against private_config, which has RLS on and
-- zero policies, and raises 42501 on any mismatch or on a null. Callable by
-- anyone, usable by nobody without the secret.
revoke all on function public.retire_push_endpoint(text, text, int) from public;
grant execute on function public.retire_push_endpoint(text, text, int) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- The relay's configuration
--
-- Two rows to fill in. Left as placeholders rather than left out, so the sender
-- below can say "push is not configured" instead of failing halfway through a
-- send that already claimed its nudges.
-- ----------------------------------------------------------------------------

-- Created here rather than assumed. private_config was originally run by hand in
-- the SQL editor and exists on production only — so every fresh database, and
-- every test run, had no such table. Identical to the definition in
-- supabase/maintenance/nudge_job.sql, and `if not exists` makes it a no-op where
-- the hand-run copy already stands.
create table if not exists public.private_config (
  name       text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.private_config enable row level security;

-- Deliberately no policies. RLS with zero policies denies everything, so this is
-- invisible to every API caller. The revokes are belt and braces.
revoke all on table public.private_config from anon, authenticated;

-- www, not the apex.
--
-- syncin.love 308-redirects to www.syncin.love, and net.http_post does not follow
-- redirects — its signature has no option to. Pointed at the apex, every relay call
-- would have received a 308 and stopped there: push would have reported itself
-- configured, the nudge would have been claimed and marked sent, and not one
-- notification would ever have arrived. Silent, and indistinguishable from "nobody
-- has subscribed yet".
insert into public.private_config (name, value)
values
  ('push_relay_url', 'https://www.syncin.love/api/push'),
  ('push_relay_secret', 'PASTE_A_LONG_RANDOM_STRING')
on conflict (name) do nothing;


-- ----------------------------------------------------------------------------
-- send_nudges(), now two channels
--
-- One claim covers both. A nudge is an event — "they answered", "a letter
-- opened" — and claiming it per channel would mean somebody with email and push
-- both on gets told twice about one thing, which is the duplicate problem this
-- whole mechanism exists to prevent.
--
-- Email still goes first and still decides success. If the relay is down, the
-- nudge was delivered; if Resend is down, it was not. Push is the better channel
-- and the less reliable one, and a person who never installed the app must not
-- silently stop being notified because a relay we added later is misconfigured.
-- ----------------------------------------------------------------------------

create or replace function public.send_nudges()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r           record;
  d           record;
  v_key       text;
  v_relay     text;
  v_secret    text;
  v_sent      int := 0;
  v_subject   text;
  v_body      text;
  v_push_body text;
  v_url       text;
  v_who       text;
begin
  select value into v_key
  from public.private_config
  where name = 'resend_api_key';

  if v_key is null or v_key like '%PASTE_YOUR_KEY%' then
    raise notice 'no usable resend key in private_config — nothing sent';
    return 0;
  end if;

  select value into v_relay from public.private_config where name = 'push_relay_url';
  select value into v_secret from public.private_config where name = 'push_relay_secret';

  -- Resolved once, before the loop. A placeholder secret means push is simply off
  -- for this run; email is unaffected.
  if v_secret is null or v_secret like 'PASTE_%' then
    v_relay := null;
  end if;

  for r in select * from public.nudge_queue(20) loop

    if not public.claim_nudge(r.pair_id, r.user_id, r.kind, r.day_index, r.letter_id) then
      continue;
    end if;

    v_who := coalesce(r.partner_first_name, 'Your person');
    v_url := 'https://syncin.love';

    if r.kind = 'partner_answered' then
      v_subject := v_who || ' has answered';
      v_body := '<p>' || v_who || ' answered today''s question. Neither of you '
             || 'sees anything until you have too.</p>';
      v_push_body := 'Neither of you sees anything until you answer too.';

    elsif r.kind = 'closing_soon' then
      v_subject := 'Today''s question closes tonight';
      v_body := '<p>Today''s question is still open. Thirty seconds keeps the '
             || 'streak.</p>';
      v_push_body := 'Still open. Thirty seconds keeps the streak.';

    elsif r.kind = 'letter_ready' then
      -- Never the title, never a word of the body. A sealed letter's contents
      -- live in the vault and nowhere else, and an email is the last place they
      -- should surface.
      v_subject := 'A letter is waiting for you';
      v_body := '<p>Something ' || v_who || ' sealed for you has reached its date. '
             || 'It is in the vault whenever you are ready.</p>';
      v_push_body := 'Something ' || v_who || ' sealed for you has reached its date.';
      v_url := 'https://syncin.love/vault';

    elsif r.kind = 'letter_opened' then
      v_subject := v_who || ' read your letter';
      v_body := '<p>The letter you sealed has been opened.</p>';
      v_push_body := 'The letter you sealed has been opened.';
      v_url := 'https://syncin.love/vault';

    else
      v_subject := 'Something was asked of you';
      v_body := '<p>' || v_who || ' asked for something from your menu. '
             || 'No clock on it — whenever you like.</p>';
      v_push_body := v_who || ' asked for something from your menu.';
      v_url := 'https://syncin.love/menu';
    end if;

    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'SyncinLove <noreply@syncin.love>',
        'to', array[r.email],
        'subject', v_subject,
        'html', v_body
          || '<p><a href="https://syncin.love">Open Sync</a></p>'
          || '<p style="color:#64748b;font-size:12px">Don''t want these? '
          || 'Turn them off under Settings.</p>'
      )
    );

    -- Then every device this person registered. One POST per device: the relay
    -- has to encrypt separately for each subscription's keypair anyway, so
    -- batching would only move the loop.
    if v_relay is not null then
      for d in
        select endpoint, p256dh, auth
        from public.push_subscriptions
        where user_id = r.user_id and failed_at is null
      loop
        perform net.http_post(
          url := v_relay,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Sync-Relay-Secret', v_secret
          ),
          body := jsonb_build_object(
            'subscription', jsonb_build_object(
              'endpoint', d.endpoint,
              'keys', jsonb_build_object('p256dh', d.p256dh, 'auth', d.auth)
            ),
            'payload', jsonb_build_object(
              'title', v_subject,
              'body', v_push_body,
              'url', v_url,
              -- One tray entry per kind per person. A second copy of "they
              -- answered" replaces the first rather than stacking.
              'tag', r.kind
            )
          )
        );
      end loop;
    end if;

    perform public.mark_nudge_sent(r.pair_id, r.user_id, r.kind, r.day_index, r.letter_id);
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.send_nudges() from public;
