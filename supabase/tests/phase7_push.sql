-- ============================================================================
-- Phase 7: web push
--
-- Two things here can go wrong in a way that matters.
--
-- One partner being able to read the other's subscriptions. A push endpoint
-- identifies a specific browser install on a specific device, and this app is
-- used by two people who often share a home and sometimes a phone. Somebody
-- learning which devices the other has registered — and when a new one appeared —
-- is surveillance, not a leak of trivia.
--
-- And the relay's secret gate. retire_push_endpoint is deliberately callable with
-- the anon key, because the relay has no session, so the secret comparison is the
-- only thing standing between the internet and the ability to silence anybody's
-- notifications. It must fail closed on a wrong secret, an empty one, and a null.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

begin;

create or replace function assert(p_ok boolean, p_what text)
returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'FAILED: %', p_what; end if;
  raise notice 'ok — %', p_what;
end $$;

\set ada 'a7000000-0000-0000-0000-0000000000a7'
\set bo  'b7000000-0000-0000-0000-0000000000b7'

insert into auth.users (id, email, is_anonymous) values
  (:'ada', 'ada@example.com', false),
  (:'bo',  'bo@example.com',  false);

insert into public.profiles (id, first_name) values (:'ada', 'Ada'), (:'bo', 'Bo');

insert into public.private_config (name, value)
values ('push_relay_secret', 'the-real-secret')
on conflict (name) do update set value = 'the-real-secret';


-- ---------------------------------------------------------------------------
-- Registering
-- ---------------------------------------------------------------------------

set sync.uid = 'a7000000-0000-0000-0000-0000000000a7';

select public.save_push_subscription(
  'https://fcm.googleapis.com/fcm/send/ada-phone', 'key-1', 'auth-1');

select assert(
  (select count(*) from public.push_subscriptions where user_id = :'ada'::uuid) = 1,
  'a device registers'
);

-- The case that actually happens: every page load hands back the same endpoint.
select public.save_push_subscription(
  'https://fcm.googleapis.com/fcm/send/ada-phone', 'key-1b', 'auth-1b');

select assert(
  (select count(*) from public.push_subscriptions where user_id = :'ada'::uuid) = 1,
  're-registering the same endpoint updates rather than duplicating, so one nudge is not sent fifty times'
);

select assert(
  (select p256dh from public.push_subscriptions
    where endpoint = 'https://fcm.googleapis.com/fcm/send/ada-phone') = 'key-1b',
  'and the refreshed keys are the ones kept'
);

-- A second device must not replace the first.
select public.save_push_subscription(
  'https://web.push.apple.com/ada-laptop', 'key-2', 'auth-2');

select assert(
  (select count(*) from public.push_subscriptions where user_id = :'ada'::uuid) = 2,
  'a phone and a laptop are two subscriptions, not one overwriting the other'
);

select assert(public.my_push_devices() = 2, 'and both are reported as live');


-- ---------------------------------------------------------------------------
-- What is refused
-- ---------------------------------------------------------------------------

do $$
begin
  perform public.save_push_subscription('http://evil.example/x', 'k', 'a');
  raise exception 'FAILED: a non-https endpoint should be refused';
exception when sqlstate '22023' then
  raise notice 'ok — a non-https endpoint is refused, so the table cannot become a list of arbitrary URLs to POST to';
end $$;

do $$
begin
  perform public.save_push_subscription('https://fcm.googleapis.com/x', '', 'a');
  raise exception 'FAILED: an empty key should be refused';
exception when sqlstate '22023' then
  raise notice 'ok — an incomplete subscription is refused';
end $$;


-- ---------------------------------------------------------------------------
-- The isolation that matters
-- ---------------------------------------------------------------------------

set sync.uid = 'b7000000-0000-0000-0000-0000000000b7';
set role authenticated;

select assert(
  (select count(*) from public.push_subscriptions) = 0,
  'a partner cannot see which devices the other registered — not one row'
);

select public.save_push_subscription(
  'https://fcm.googleapis.com/fcm/send/bo-phone', 'key-3', 'auth-3');

select assert(public.my_push_devices() = 1, 'and counts only their own');

-- Nor take one over. RLS's with-check is what stops an endpoint being reassigned.
do $$
begin
  update public.push_subscriptions
  set p256dh = 'stolen'
  where endpoint = 'https://fcm.googleapis.com/fcm/send/ada-phone';

  if found then
    raise exception 'FAILED: one partner rewrote the other''s subscription';
  end if;
  raise notice 'ok — and cannot rewrite one belonging to the other';
end $$;

reset role;


-- ---------------------------------------------------------------------------
-- The relay's gate
-- ---------------------------------------------------------------------------

do $$
begin
  perform public.retire_push_endpoint('wrong', 'https://fcm.googleapis.com/fcm/send/ada-phone', 410);
  raise exception 'FAILED: a wrong secret was accepted';
exception when sqlstate '42501' then
  raise notice 'ok — a wrong secret is refused';
end $$;

do $$
begin
  perform public.retire_push_endpoint(null, 'https://fcm.googleapis.com/fcm/send/ada-phone', 410);
  raise exception 'FAILED: a null secret was accepted';
exception when sqlstate '42501' then
  raise notice 'ok — and a null secret fails closed rather than comparing equal to nothing';
end $$;

-- With no secret configured at all, nothing may be retired. This is the state a
-- fresh database is in, and it must not be the state in which anybody can call it.
update public.private_config set value = '' where name = 'push_relay_secret';
do $$
begin
  perform public.retire_push_endpoint('', 'https://fcm.googleapis.com/fcm/send/ada-phone', 410);
  raise exception 'FAILED: an unconfigured relay accepted an empty secret';
exception when sqlstate '42501' then
  raise notice 'ok — an unconfigured relay refuses everything, including a matching empty string';
end $$;
update public.private_config set value = 'the-real-secret' where name = 'push_relay_secret';

select public.retire_push_endpoint(
  'the-real-secret', 'https://fcm.googleapis.com/fcm/send/ada-phone', 410);

select assert(
  (select failed_at is not null and failed_code = 410
   from public.push_subscriptions
   where endpoint = 'https://fcm.googleapis.com/fcm/send/ada-phone'),
  'the right secret retires a dead endpoint'
);

set sync.uid = 'a7000000-0000-0000-0000-0000000000a7';
select assert(
  public.my_push_devices() = 1,
  'a retired device stops counting, so the sender stops POSTing to it forever'
);

-- And re-registering brings it back: a browser update can revive an endpoint the
-- push service rejected last week, and the device asking is the best evidence.
select public.save_push_subscription(
  'https://fcm.googleapis.com/fcm/send/ada-phone', 'key-1c', 'auth-1c');
select assert(
  public.my_push_devices() = 2,
  'and registering again revives it'
);


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select assert(
  has_function_privilege('authenticated', 'public.save_push_subscription(text,text,text)', 'execute'),
  'a signed-in user may register their own device'
);

select assert(
  has_function_privilege('anon', 'public.save_push_subscription(text,text,text)', 'execute') is false,
  'but not anonymously — save_push_subscription needs a real uid to attach to'
);

-- Granted to anon on purpose: the relay is a server with no session. Recorded as a
-- test so it reads as a decision rather than an oversight to whoever finds it next.
select assert(
  has_function_privilege('anon', 'public.retire_push_endpoint(text,text,int)', 'execute'),
  'the relay reaches retire_push_endpoint as anon, and the secret is the only gate'
);

select assert(
  has_function_privilege('authenticated', 'public.send_nudges()', 'execute') is false,
  'and nobody can trigger a send run through the API'
);

-- ---------------------------------------------------------------------------
-- How long a push should live
--
-- Every notification used to go out with a uniform twelve-hour TTL. Two hours too long
-- for a question that stops being answerable at 06:00, and days too short for a sealed
-- letter that has no deadline at all.
-- ---------------------------------------------------------------------------

\set tzpair 'e7e70000-0000-0000-0000-00000000e7e7'

insert into public.pairs (id, time_zone, day_zero, status)
values (:'tzpair', 'Pacific/Kiritimati', current_date - 5, 'active');   -- UTC+14

select assert(
  public.seconds_until_day_closes(:'tzpair') between 5 * 60 and 24 * 60 * 60,
  'a day-scoped push expires within a day, never longer'
);

-- The point of the function: the answer is the PAIR's 06:00, not the server's. Two
-- pairings 25 hours apart cannot both have the same number of seconds left unless the
-- timezone is being ignored.
insert into public.pairs (id, time_zone, day_zero, status)
values ('e7e70000-0000-0000-0000-0000000000e8', 'Pacific/Midway', current_date - 5, 'active');

select assert(
  public.seconds_until_day_closes(:'tzpair')
    <> public.seconds_until_day_closes('e7e70000-0000-0000-0000-0000000000e8'),
  'and it is counted on the couple''s clock, not the server''s'
);

/*
  Never zero, never negative.

  A nudge computed at 05:58 has two minutes left, and web-push treats a zero TTL as
  "deliver now or discard" — which for a device that is merely asleep means discard.
  Floored at five minutes: slightly stale beats silently dropped.
*/
select assert(
  public.seconds_until_day_closes(:'tzpair') >= 5 * 60,
  'and never so short that the push is discarded before it can be delivered'
);

-- An unknown pairing gets the old default rather than an error. send_nudges is a cron
-- job; one deleted pairing mid-run must not stop the other nineteen nudges.
select assert(
  public.seconds_until_day_closes('00000000-0000-0000-0000-000000000000') = 12 * 60 * 60,
  'an unknown pairing falls back rather than raising inside a cron run'
);

/*
  The weld this depends on.

  The relay derives the kind from the notification TAG — the tag exists so a second
  "they answered" replaces the first in the tray, and per-kind is exactly that
  granularity. Nothing else enforces that they stay the same thing, so it is asserted
  structurally rather than assumed: if somebody makes the tag per-day, every push
  silently reverts to the twelve-hour default and no test would otherwise notice.
*/
select assert(
  pg_get_functiondef('public.send_nudges()'::regprocedure) like '%''tag'', r.kind%',
  'the notification tag is the nudge kind, which is what the relay reads it as'
);

select assert(
  pg_get_functiondef('public.send_nudges()'::regprocedure) like '%seconds_until_day_closes%',
  'and day-scoped nudges take their TTL from the pair''s clock'
);

select assert(
  pg_get_functiondef('public.send_nudges()'::regprocedure) like '%''urgency'', v_urgency%',
  'and urgency travels with them, so a deadline nudge is not batched behind a letter'
);

rollback;
