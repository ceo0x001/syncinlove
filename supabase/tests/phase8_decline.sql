-- ============================================================================
-- Phase 8: declining an invite
--
-- The property this suite exists for is a negative one: nothing anywhere records
-- or exposes WHY somebody could not join.
--
-- The tempting version of this feature tells the sender "they're already paired".
-- That hands one person another person's relationship status because they tapped a
-- link, and it arrives by default rather than by anybody's choice. So decline is an
-- explicit act, it stores a timestamp and an actor and no reason, and peek_invite
-- must never leak the decliner's identity back to whoever holds the token.
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

\set ada  'a8000000-0000-0000-0000-0000000000a8'
\set bo   'b8000000-0000-0000-0000-0000000000b8'
\set cleo 'c8000000-0000-0000-0000-0000000000c8'

insert into auth.users (id, email, is_anonymous) values
  (:'ada',  'ada8@example.com',  false),
  (:'bo',   'bo8@example.com',   false),
  (:'cleo', 'cleo8@example.com', false);

insert into public.profiles (id, first_name) values
  (:'ada', 'Ada'), (:'bo', 'Bo'), (:'cleo', 'Cleo');

-- Cleo and Bo are already a couple, with real history.
insert into public.pairs (id, time_zone, day_zero, status)
values ('88880000-0000-0000-0000-000000000088', 'UTC', current_date - 5, 'active');
insert into public.pair_members (pair_id, user_id, role) values
  ('88880000-0000-0000-0000-000000000088', :'cleo', 'inviter'),
  ('88880000-0000-0000-0000-000000000088', :'bo',   'invitee');

-- Ada is waiting alone, and has invited somebody.
insert into public.pairs (id, time_zone, day_zero, status)
values ('99990000-0000-0000-0000-000000000099', 'UTC', current_date, 'pending');
insert into public.pair_members (pair_id, user_id, role) values
  ('99990000-0000-0000-0000-000000000099', :'ada', 'inviter');

insert into public.invites (pair_id, token_hash, nonce, created_by, expires_at)
values ('99990000-0000-0000-0000-000000000099', 'hash-ada', 'nonce-ada', :'ada',
        now() + interval '7 days');


-- ---------------------------------------------------------------------------
-- The situation that motivated this: already paired, following a new link
-- ---------------------------------------------------------------------------

set sync.uid = 'b8000000-0000-0000-0000-0000000000b8';

do $$
begin
  perform public.claim_invite('hash-ada');
  raise exception 'FAILED: an already-paired person joined a second pairing';
exception when sqlstate 'P0008' then
  raise notice 'ok — somebody already synced cannot claim another link';
end $$;

select assert(
  (select count(*) from public.pair_members
    where user_id = :'bo'::uuid and left_at is null) = 1,
  'and their existing pairing is untouched'
);


-- ---------------------------------------------------------------------------
-- Declining
-- ---------------------------------------------------------------------------

select public.decline_invite('hash-ada');

select assert(
  (select declined_at is not null from public.invites where token_hash = 'hash-ada'),
  'the decline is recorded'
);

select assert(
  (select revoked_at is not null from public.invites where token_hash = 'hash-ada'),
  'and it closes the link, so a forwarded copy cannot still be claimed'
);

-- THE POINT OF THE SUITE. Only a who and a when — never a why.
select assert(
  (select count(*) from information_schema.columns
    where table_name = 'invites'
      and column_name ~ '(reason|declined_because|status_detail|already_paired)') = 0,
  'nothing on the invite can hold a REASON for the decline'
);

select assert(
  (select public.peek_invite('hash-ada') ->> 'state') = 'declined',
  'peek reports declined'
);

select assert(
  (select public.peek_invite('hash-ada') ->> 'inviter_first_name') = 'Ada',
  'and still names the inviter, which the recipient already knew'
);

-- Anybody can hold a token. It must not tell them who turned it down.
select assert(
  (select count(*) from jsonb_object_keys(public.peek_invite('hash-ada')) k
    where k in ('declined_by', 'declined_at', 'decliner_first_name', 'reason')) = 0,
  'and never says WHO declined it, or why, to whoever holds the token'
);

select assert(
  (select public.peek_invite('hash-ada')::text) not like '%Bo%',
  'the decliner does not appear anywhere in the peek payload'
);

-- Declining twice is a no-op, not an error: stale pages and double taps exist.
select public.decline_invite('hash-ada');
select assert(
  (select count(*) from public.invites where token_hash = 'hash-ada'
    and declined_by = :'bo'::uuid) = 1,
  'declining twice is idempotent and does not reassign the decline'
);

reset role;


-- ---------------------------------------------------------------------------
-- What declining may never do
-- ---------------------------------------------------------------------------

insert into public.invites (pair_id, token_hash, nonce, created_by, expires_at)
values ('88880000-0000-0000-0000-000000000088', 'hash-cleo', 'nonce-cleo', :'cleo',
        now() + interval '7 days');

set sync.uid = 'c8000000-0000-0000-0000-0000000000c8';
do $$
begin
  perform public.decline_invite('hash-cleo');
  raise exception 'FAILED: somebody declined their own invite';
exception when sqlstate 'P0006' then
  raise notice 'ok — you cannot decline your own link';
end $$;

-- A claimed invite is a live pairing. Decline must not reach into one.
update public.invites
set claimed_at = now(), claimed_by = :'bo'::uuid
where token_hash = 'hash-cleo';

set sync.uid = 'a8000000-0000-0000-0000-0000000000a8';
do $$
begin
  perform public.decline_invite('hash-cleo');
  raise exception 'FAILED: a claimed invite was declined';
exception when sqlstate 'P0007' then
  raise notice 'ok — an invite that already formed a pairing cannot be declined';
end $$;

do $$
begin
  perform public.decline_invite('hash-does-not-exist');
  raise exception 'FAILED: an unknown token was accepted';
exception when sqlstate 'P0002' then
  raise notice 'ok — an unknown token is refused';
end $$;

reset role;


-- ---------------------------------------------------------------------------
-- Reissuing after a decline
-- ---------------------------------------------------------------------------

set sync.uid = 'a8000000-0000-0000-0000-0000000000a8';

select public.clear_declines();
select assert(
  (select declined_at is null from public.invites where token_hash = 'hash-ada'),
  'reissuing clears the decline, so the panel reports the new link and not the old one'
);

select assert(
  (select revoked_at is not null from public.invites where token_hash = 'hash-ada'),
  'but the old link stays closed — clearing the flag must not revive it'
);

-- clear_declines is scoped to the caller's own pairing.
set sync.uid = 'c8000000-0000-0000-0000-0000000000c8';
update public.invites set declined_at = now() where token_hash = 'hash-ada';
select public.clear_declines();
select assert(
  (select declined_at is not null from public.invites where token_hash = 'hash-ada'),
  'and it cannot clear a decline on somebody else''s pairing'
);

reset role;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

select assert(
  has_function_privilege('authenticated', 'public.decline_invite(text)', 'execute'),
  'a signed-in user may decline'
);

select assert(
  has_function_privilege('anon', 'public.decline_invite(text)', 'execute') is false,
  'but not anonymously — declining needs a uid to record'
);

select assert(
  has_function_privilege('anon', 'public.peek_invite(text)', 'execute'),
  'peek stays reachable anonymously, which is how an invited stranger reads it'
);

rollback;
