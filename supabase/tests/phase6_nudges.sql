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
  has_function_privilege('authenticated', 'public.claim_nudge(uuid,uuid,text,int,uuid)', 'execute') is false,
  'and neither is claiming'
);

select assert(
  has_function_privilege('authenticated', 'public.update_notify_prefs(boolean,boolean,boolean,boolean)', 'execute'),
  'but changing your own preferences is'
);


-- ---------------------------------------------------------------------------
-- Letters
--
-- The property worth defending: a recipient can destroy a sealed letter unread
-- and the sender is never told. That silence was promised so somebody can
-- decline a message from a relationship that went wrong without reading it and
-- without explaining. A notification would break the promise quietly.
-- ---------------------------------------------------------------------------

\set ready  'aaaa1111-0000-0000-0000-0000000011aa'
\set future 'bbbb2222-0000-0000-0000-0000000022bb'

insert into public.letters (id, pair_id, sender_id, recipient_id, title, body, unlock_on, date_visible)
values
  (:'ready',  :'pair', :'ann', :'ben', 'Ready',  'body', current_date - 1, true),
  (:'future', :'pair', :'ann', :'ben', 'Future', 'body', current_date + 9, true);

select assert(
  (select count(*) from public.nudge_queue(0)
    where kind = 'letter_ready' and letter_id = :'ready'::uuid) = 1,
  'a letter whose date has arrived is announced to its recipient'
);

select assert(
  (select count(*) from public.nudge_queue(0)
    where kind = 'letter_ready' and letter_id = :'future'::uuid) = 0,
  'and one still in the future is not'
);

-- The recipient can see how far off a dated letter is.
set sync.uid = 'b1000000-0000-0000-0000-0000000000b1';
select assert(
  (select days_away from public.sealed_for_me() where letter_id = :'future'::uuid) = 9,
  'the recipient is told how many days until it opens'
);

select public.open_letter(:'ready');

select assert(
  (select count(*) from public.nudge_queue(0)
    where kind = 'letter_opened' and letter_id = :'ready'::uuid
      and user_id = :'ann'::uuid) = 1,
  'opening it tells the sender, and only the sender'
);

-- Now the one that matters. Bring the future letter's date forward so it is
-- openable, then refuse it instead.
update public.letters set unlock_on = current_date where id = :'future';
select public.destroy_letter(:'future');

select assert(
  (select count(*) from public.nudge_queue(0)
    where kind = 'letter_opened' and letter_id = :'future'::uuid) = 0,
  'a letter destroyed unread tells the sender NOTHING'
);

select assert(
  (select count(*) from public.letters where id = :'future'::uuid) = 0,
  'and it is really gone'
);

-- Preference.
update public.profiles set notify_letters = false;
select assert(
  (select count(*) from public.nudge_queue(0) where kind like 'letter%') = 0,
  'switching letters off silences both kinds'
);
update public.profiles set notify_letters = true;

-- Claiming is per letter, not per kind: two ready letters must be two nudges.
select assert(
  public.claim_nudge(:'pair', :'ben', 'letter_ready', null, :'ready'::uuid) is true,
  'the first claim on a letter wins'
);
select assert(
  public.claim_nudge(:'pair', :'ben', 'letter_ready', null, :'ready'::uuid) is false,
  'a letter already notified is not notified twice'
);
-- A real second letter, not a fabricated id: notifications.letter_id carries a
-- foreign key, so a made-up uuid tests the constraint rather than the claim.
\set second 'cccc3333-0000-0000-0000-0000000033cc'
insert into public.letters (id, pair_id, sender_id, recipient_id, title, body, unlock_on, date_visible)
values (:'second', :'pair', :'ann', :'ben', 'Second', 'body', current_date, true);

select assert(
  public.claim_nudge(:'pair', :'ben', 'letter_ready', null, :'second'::uuid) is true,
  'but a different letter claims separately, so the second one is not swallowed'
);

rollback;
