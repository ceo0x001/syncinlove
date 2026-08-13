-- ============================================================================
-- A reminder that stops, and one that stays true
--
-- Two things were asked for: that a person hears about it when their partner answers,
-- and that a couple who go quiet get reminded. Both already existed — and looking at
-- them turned up a different problem than the one being reported.
--
-- WHAT WAS ALREADY RIGHT
--
-- partner_answered is queued the instant one of them has answered and the other has
-- not, with no hour gate, and goes out by email AND push. It is on by default. The only
-- latency is the cron interval, which is a schedule question rather than a code one.
--
-- WHAT WAS WRONG
--
-- closing_soon fired every evening a person had not answered, with no notion of how
-- long that had been going on, forever. Two consequences, and the second is the
-- expensive one.
--
-- The copy became false. "Thirty seconds keeps the streak" is true on the first
-- evening. On the fifth it is not — the streak has gone, thirty seconds keeps nothing,
-- and the app is now the thing in the room saying something untrue. That is the same
-- failure as a push whose TTL outlived its deadline, which 0026 fixed for the same
-- reason.
--
-- And it costs the channel. Twenty-one identical emails about an abandoned streak is
-- how an address marks a sender as spam, and once that happens the nudges that actually
-- matter stop arriving: a sealed letter reaching its date, something asked of you from
-- your menu. Nagging about a lapsed streak is a poor trade for the one message somebody
-- would have wanted.
--
-- THE TAPER
--
--   1-3 days    nightly, and the streak is mentioned because it is still there
--   7,14,21,28  weekly, warm, no pretence about the streak
--   29+         nothing
--
-- Friendly throughout, and deliberately not escalating. Somebody who has missed a week
-- does not need an app raising its voice about their relationship.
--
-- WHAT THIS DOES NOT CHANGE
--
-- Nothing about partner_answered, requests or letters. Those fire on events with their
-- own meaning, and none of them repeats: a letter reaching its date happens once.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- nudge_queue, carrying how long it has been
--
-- Dropped and recreated rather than replaced: the return type gains a column, and
-- `create or replace function` cannot change a return type. A trap this schema has hit
-- before — 0016 dropped this same function for the same reason.
-- ----------------------------------------------------------------------------

drop function if exists public.nudge_queue(int);

create function public.nudge_queue(p_evening_hour int default 20)
returns table (
  pair_id    uuid,
  user_id    uuid,
  email      text,
  first_name text,
  kind       text,
  day_index  int,
  partner_first_name text,
  letter_id  uuid,
  /**
   * Days since this person last answered anything. Zero means today.
   *
   * Carried out of the queue rather than recomputed in send_nudges, so the decision
   * about WHETHER to nudge and the choice of WHAT to say come from the same number.
   * Two lookups would eventually disagree, and that disagreement reads as "it told me
   * the streak was fine on the day it told me the streak was gone".
   */
  days_since int
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
      (now() at time zone p.time_zone)::date as local_date,
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
      pr.notify_letters,
      u.email::text as email,
      (select pm2.user_id from public.pair_members pm2
        where pm2.pair_id = l.pair_id and pm2.user_id <> pm.user_id
          and pm2.left_at is null limit 1) as partner_id
    from live l
    join public.pair_members pm on pm.pair_id = l.pair_id and pm.left_at is null
    join public.profiles pr on pr.id = pm.user_id
    join auth.users u on u.id = pm.user_id
    where u.email is not null
      and u.email <> ''
      and pr.suspended_at is null
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
        as partner_first_name,
      /*
        How long they have been away.

        Their OWN last answer, not the pair's last reveal: somebody answering every day
        while their partner does not is not the one who needs telling it has been a
        while.

        coalesce to -1 so a pairing that has never answered reads as one day away on
        day 0 rather than as null. A brand-new couple gets the ordinary nightly nudge,
        not the "it has been a while" one.
      */
      pe.today - coalesce(
        (select max(a.day_index) from public.answers a
          where a.pair_id = pe.pair_id and a.user_id = pe.user_id),
        -1
      ) as days_since
    from people pe
  ),
  candidates as (
    select s.pair_id, s.user_id, s.email, s.first_name,
           'partner_answered'::text as kind, s.today as day_index,
           s.partner_first_name, null::uuid as letter_id, s.days_since
    from state s
    where s.notify_partner
      and coalesce(s.they_answered, false)
      and not coalesce(s.i_answered, false)
      and not coalesce(s.revealed, false)

    union all

    select s.pair_id, s.user_id, s.email, s.first_name,
           'closing_soon', s.today, s.partner_first_name, null::uuid, s.days_since
    from state s
    where s.notify_reminders
      and s.local_hour >= p_evening_hour
      and not coalesce(s.i_answered, false)
      /*
        The taper, and why it exists.

        This used to be every evening, forever. A couple who drifted away got "Still
        open. Thirty seconds keeps the streak" every night indefinitely — copy that is
        false after the second missed day, since thirty seconds no longer keeps
        anything, and twenty-one identical emails about an abandoned streak is how an
        address marks you as spam. Losing the channel costs the nudges that genuinely
        matter: a letter reaching its date, something asked of you.

          1-3 days    nightly. A day or two off is not drifting away.
          7,14,21,28  weekly. Still here, and honest that the streak has gone.
          29+         silence. If a month of evenings did not land, another will not,
                      and continuing to ask is not friendliness.

        Each of these is already at most one per person per day, via the notifications
        unique index. This decides which days ask at all.
      */
      and (
        s.days_since <= 3
        or (s.days_since <= 28 and s.days_since % 7 = 0)
      )

    union all

    select distinct s.pair_id, s.user_id, s.email, s.first_name,
           'request', null::int, s.partner_first_name, null::uuid, s.days_since
    from state s
    join public.purchases pu
      on pu.pair_id = s.pair_id
     and pu.seller_id = s.user_id
     and pu.status = 'requested'
    where s.notify_requests

    union all

    -- A letter addressed to them has reached its date and is still unread.
    select s.pair_id, s.user_id, s.email, s.first_name,
           'letter_ready', null::int, s.partner_first_name, le.id, s.days_since
    from state s
    join public.letters le
      on le.pair_id = s.pair_id
     and le.recipient_id = s.user_id
     and le.opened_at is null
     and le.unlock_on <= s.local_date
    where s.notify_letters

    union all

    -- A letter they sealed has been read. Fires on opened_at, so a letter the
    -- recipient destroyed unread stays silent — as promised.
    select s.pair_id, s.user_id, s.email, s.first_name,
           'letter_opened', null::int, s.partner_first_name, le.id, s.days_since
    from state s
    join public.letters le
      on le.pair_id = s.pair_id
     and le.sender_id = s.user_id
     and le.opened_at is not null
    where s.notify_letters
  )
  select c.pair_id, c.user_id, c.email, c.first_name, c.kind, c.day_index,
         c.partner_first_name, c.letter_id, c.days_since
  from candidates c
  where not exists (
    select 1 from public.notifications n
    where n.pair_id = c.pair_id
      and n.user_id = c.user_id
      and n.kind = c.kind
      and coalesce(n.day_index, -1) = coalesce(c.day_index, -1)
      and coalesce(n.letter_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(c.letter_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
$$;


revoke all on function public.nudge_queue(int) from public;
revoke all on function public.nudge_queue(int) from anon;
revoke all on function public.nudge_queue(int) from authenticated;


-- ----------------------------------------------------------------------------
-- send_nudges, saying the right one of three things
--
-- 0026's body verbatim apart from the closing_soon branch, which becomes three. Copied
-- rather than rewritten, per the rule 0023 arrived at the hard way after I reproduced
-- this function from memory and got five things wrong.
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
  v_ttl       int;
  v_urgency   text;
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

    /*
      Delivery, decided with the copy rather than after it.
     
      Day-scoped kinds expire when the question does: 06:00 pair-local, per
      pair_day_is_open. The relay cannot compute that — it has no database credentials,
      which is exactly why it is safe to run — so the seconds are worked out here where
      the pair's timezone is known.
     
      Letters and requests have no deadline at all. The email for a menu request says
      "no clock on it", and a sealed letter reaching its date is just as true on Sunday
      as it was on Friday.
    */
    v_ttl := 3 * 24 * 60 * 60;
    v_urgency := 'normal';

    if r.kind = 'partner_answered' then
      v_subject := v_who || ' has answered';
      v_body := '<p>' || v_who || ' answered today''s question. Neither of you '
             || 'sees anything until you have too.</p>';
      v_push_body := 'Neither of you sees anything until you answer too.';
      v_ttl := public.seconds_until_day_closes(r.pair_id);

    elsif r.kind = 'closing_soon' then
      /*
        Three voices, chosen by how long they have been away, and all of them warm.

        The old one was a single line — "Thirty seconds keeps the streak" — sent every
        evening forever. After the second missed day that sentence is simply untrue, and
        a reminder that is wrong about the thing it is reminding you of is worse than no
        reminder: it teaches people that these messages do not describe reality.

        So the streak is only mentioned while there is one to keep. Past that the tone
        drops the urgency rather than raising it, because somebody who has missed a week
        does not need to be told off by an app about their relationship.
      */
      if r.days_since <= 1 then
        v_subject := 'Today''s question closes tonight';
        v_body := '<p>Today''s question is still open. Thirty seconds, and you are both '
               || 'in.</p>';
        v_push_body := 'Still open. Thirty seconds, and you are both in.';

      elsif r.days_since <= 3 then
        v_subject := 'Today''s question is still there';
        v_body := '<p>A couple of days off, no bother. Today''s question is waiting '
               || 'whenever you fancy it.</p>';
        v_push_body := 'A couple of days off, no bother. Today''s is still waiting.';

      else
        -- Weekly from here, and honest: the streak has gone and nobody is pretending
        -- otherwise. What is on offer is a question, not a scolding.
        v_subject := 'Still here whenever you want it';
        v_body := '<p>It has been a little while, and that is completely fine. '
               || 'Whenever the two of you feel like it, there is a question '
               || 'waiting.</p>';
        v_push_body := 'It has been a while, and that is fine. A question is waiting.';
      end if;

      v_ttl := public.seconds_until_day_closes(r.pair_id);
      -- The only kind with a deadline. A push service may batch 'normal' deliveries,
      -- and a reminder that lands after the thing it reminds you about is worse than
      -- none at all.
      v_urgency := 'high';

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
      -- Nothing to do about it, so it need not compete for attention.
      v_urgency := 'low';
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
              --
              -- The relay also reads this as the kind, and phase7_push asserts the two
              -- stay welded together so that is a guarantee rather than a coincidence.
              'tag', r.kind
            ),
            'ttl', v_ttl,
            'urgency', v_urgency
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
revoke all on function public.send_nudges() from anon;
revoke all on function public.send_nudges() from authenticated;
