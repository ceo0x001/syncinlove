-- ============================================================================
-- Phase 5: nudges.
--
-- The decision engine, which is the part that can be wrong in an interesting
-- way. The HTTP send is four lines of pg_net and is not exercised here — pg_net
-- does not exist in this cluster — so everything that decides WHO gets mailed is
-- covered instead.
--
-- Two properties matter most. Somebody who switched a kind off must never
-- receive it, and no nudge may ever be sent twice: this app emails people about
-- their relationship, and a duplicate at 8pm reads as a bug in something more
-- personal than software.
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

\set ann 'a1000000-0000-0000-0000-0000000000a1'
\set ben 'b1000000-0000-0000-0000-0000000000b1'
\set pair '99990000-0000-0000-0000-000000000099'

insert into auth.users (id, email, is_anonymous) values
  (:'ann', 'ann@example.com', false),
  (:'ben', 'ben@example.com', false);

insert into public.profiles (id, first_name) values
  (:'ann', 'Ann'),
  (:'ben', 'Ben');

insert into public.pairs (id, time_zone, day_zero, status)
values (:'pair', 'UTC', current_date, 'active');

insert into public.pair_members (pair_id, user_id, role) values
  (:'pair', :'ann', 'inviter'),
  (:'pair', :'ben', 'invitee');


-- ---------------------------------------------------------------------------
-- Nothing owed to anybody yet
-- ---------------------------------------------------------------------------

select assert(
  (select count(*) from public.nudge_queue(20)) = 0,
  'an untouched day before the evening owes nobody anything'
);


-- ---------------------------------------------------------------------------
-- Somebody is waiting
-- ---------------------------------------------------------------------------

insert into public.answers (pair_id, day_index, question_id, user_id, self_payload, guess_payload)
values (:'pair', 0, (select id from public.questions limit 1), :'ben', '{}'::jsonb, '{}'::jsonb);

select assert(
  (select count(*) from public.nudge_queue(20) where kind = 'partner_answered') = 1,
  'the one who has not answered is told their partner is waiting'
);

select assert(
  (select user_id from public.nudge_queue(20) where kind = 'partner_answered') = :'ann'::uuid,
  'and it goes to them, not to the one who already answered'
);


-- ---------------------------------------------------------------------------
-- The evening reminder, on the pair's clock
-- ---------------------------------------------------------------------------

select assert(
  (select count(*) from public.nudge_queue(0) where kind = 'closing_soon') = 1,
  'past the pair-local evening hour, the unanswered day is chased'
);

select assert(
  (select count(*) from public.nudge_queue(0)
    where kind = 'closing_soon' and user_id = :'ben'::uuid) = 0,
  'somebody who already answered is never chased'
);


-- ---------------------------------------------------------------------------
-- Preferences are obeyed
-- ---------------------------------------------------------------------------

update public.profiles set notify_partner = false where id = :'ann';
select assert(
  (select count(*) from public.nudge_queue(0) where kind = 'partner_answered') = 0,
  'switching a kind off silences that kind'
);

select assert(
  (select count(*) from public.nudge_queue(0) where kind = 'closing_soon') = 1,
  'and leaves the others alone'
);
update public.profiles set notify_partner = true where id = :'ann';


-- ---------------------------------------------------------------------------
-- No address, no nudge
--
-- An unconfirmed account has no email. Queuing one would mean the job tries to
-- send to nothing, every hour, forever.
-- ---------------------------------------------------------------------------

update auth.users set email = null where id = :'ann';
select assert(
  (select count(*) from public.nudge_queue(0) where user_id = :'ann'::uuid) = 0,
  'an account with no confirmed address is never queued'
);
update auth.users set email = 'ann@example.com' where id = :'ann';


-- ---------------------------------------------------------------------------
-- Claiming, which is what stops a second copy
-- ---------------------------------------------------------------------------

select assert(
  public.claim_nudge(:'pair', :'ann', 'partner_answered', 0) is true,
  'the first claim wins'
);

select assert(
  public.claim_nudge(:'pair', :'ann', 'partner_answered', 0) is false,
  'a second claim for the same nudge is refused, so it cannot send twice'
);

select assert(
  (select count(*) from public.nudge_queue(0) where kind = 'partner_answered') = 0,
  'a claimed nudge drops out of the queue'
);

select assert(
  (select count(*) from public.notifications
    where kind = 'partner_answered' and sent_at is null) = 1,
  'claimed but unsent is visible, so a failed send can be retried'
);

select public.mark_nudge_sent(:'pair', :'ann', 'partner_answered', 0);
select assert(
  (select count(*) from public.notifications
    where kind = 'partner_answered' and sent_at is not null) = 1,
  'and marking it sent records when'
);


-- ---------------------------------------------------------------------------
-- Answering settles it
-- ---------------------------------------------------------------------------

insert into public.answers (pair_id, day_index, question_id, user_id, self_payload, guess_payload)
values (:'pair', 0, (select id from public.questions limit 1), :'ann', '{}'::jsonb, '{}'::jsonb);

select assert(
  (select count(*) from public.nudge_queue(0) where user_id = :'ann'::uuid) = 0,
  'once you have answered, nothing is owed to you'
);


-- ---------------------------------------------------------------------------
-- Only live, two-person pairings
-- ---------------------------------------------------------------------------

update public.pairs set status = 'ended' where id = :'pair';
select assert(
  (select count(*) from public.nudge_queue(0)) = 0,
  'an ended pairing is never nudged'
);
update public.pairs set status = 'active' where id = :'pair';

update public.pair_members set left_at = now() where user_id = :'ben';
select assert(
  (select count(*) from public.nudge_queue(0)) = 0,
  'and neither is a pairing somebody has left'
);
update public.pair_members set left_at = null where user_id = :'ben';


-- ---------------------------------------------------------------------------
-- Leakage
--
-- nudge_queue returns email addresses for every pairing in the database.
-- ---------------------------------------------------------------------------

select assert(
  has_function_privilege('authenticated', 'public.nudge_queue(int)', 'execute') is false,
  'the queue is not callable by a signed-in user'
);

select assert(
  has_function_privilege('anon', 'public.nudge_queue(int)', 'execute') is false,
  'nor anonymously'
);

select assert(
  has_function_privilege('authenticated', 'public.claim_nudge(uuid,uuid,text,int)', 'execute') is false,
  'and neither is claiming'
);

select assert(
  has_function_privilege('authenticated', 'public.update_notify_prefs(boolean,boolean,boolean)', 'execute'),
  'but changing your own preferences is'
);

rollback;
