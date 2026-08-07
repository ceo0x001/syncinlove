-- ============================================================================
-- A push expires when the thing it is about expires
--
-- Every notification went out with `TTL: 43200, urgency: 'normal'` — twelve hours for
-- all five kinds — and that is wrong in both directions at once.
--
-- Too long for anything scoped to a day. closing_soon fires from 20:00 pair-local and
-- the question stays answerable until 06:00, so ten hours. At twelve, a phone that comes
-- back online at 08:00 shows "Still open. Thirty seconds keeps the streak" about a day
-- that shut two hours earlier. Two hours, not the eight I first claimed — I had
-- forgotten the 06:00 grace window and checked before writing this. Still worth fixing:
-- a notification that lies about a deadline teaches people to distrust the ones that do
-- not.
--
-- Far too short for everything else, and this is the real defect. A sealed letter
-- reaching its date has no deadline, and neither does something asked from a menu — its
-- email literally says "no clock on it". Twelve hours means a phone switched off for a
-- weekend loses the letter notification permanently. The vault is the most emotionally
-- loaded thing in this product and its notification was the most disposable.
--
-- WHY THE DEADLINE IS COMPUTED HERE
--
-- It is 06:00 in the PAIR's timezone. The relay receives an endpoint and a payload and
-- holds no database credentials — that is the property which makes it safe to run at
-- all — so it cannot know a pairing's clock. Postgres can, so Postgres sends the number
-- and the relay clamps it.
--
-- DEPLOY ORDER DOES NOT MATTER
--
-- The relay defaults per kind when no ttl arrives, so an older database is already
-- better off than it was. An older relay ignores the two new fields. Neither half waits
-- for the other.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- How long a day-scoped nudge stays true
--
-- pair_day_is_open keeps yesterday answerable until 06:00 pair-local, so that is the
-- moment a "today's question" push stops being about anything.
--
-- Floored at five minutes rather than zero: a nudge computed at 05:58 has two minutes
-- left, and a push that expires before it can plausibly be delivered is a wasted
-- request. Five minutes of being slightly stale beats sending nothing.
-- ----------------------------------------------------------------------------

create or replace function public.seconds_until_day_closes(p_pair_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_tz    text;
  v_local timestamp;
  v_close timestamp;
begin
  select time_zone into v_tz from public.pairs where id = p_pair_id;
  if v_tz is null then
    return 12 * 60 * 60;
  end if;

  v_local := now() at time zone v_tz;

  -- Tonight's 06:00 if we are already past it, otherwise this morning's.
  v_close := date_trunc('day', v_local) + interval '6 hours';
  if v_local >= v_close then
    v_close := v_close + interval '1 day';
  end if;

  return greatest(5 * 60, extract(epoch from (v_close - v_local))::int);
end;
$$;

comment on function public.seconds_until_day_closes(uuid) is
  'Seconds until this pairing''s current question stops being answerable, at 06:00 on '
  'their own clock. Sent to the push relay as a TTL, because the relay holds no '
  'database credentials and cannot know a pairing''s timezone.';

revoke all on function public.seconds_until_day_closes(uuid) from public;
revoke all on function public.seconds_until_day_closes(uuid) from anon;
grant execute on function public.seconds_until_day_closes(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- send_nudges, carrying the delivery options
--
-- 0017's body verbatim apart from the additions above: two locals, a per-kind ttl and
-- urgency set beside the copy each branch already writes, and both fields added to the
-- relay POST. Copied rather than rewritten, per the rule 0023 arrived at the hard way.
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
      v_subject := 'Today''s question closes tonight';
      v_body := '<p>Today''s question is still open. Thirty seconds keeps the '
             || 'streak.</p>';
      v_push_body := 'Still open. Thirty seconds keeps the streak.';
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


-- Nobody reaches this through the API, and that is deliberate: it is a cron job. Granting
-- it to authenticated would let any signed-in person drain the nudge queue on demand.
--
-- Written wrongly here first — the footer granted it to authenticated out of habit from
-- every other function in this schema, and phase7_push's existing assertion caught it
-- immediately. Worth leaving the note: the pattern that is right for a user-facing RPC is
-- exactly wrong for a scheduled one.
revoke all on function public.send_nudges() from public;
revoke all on function public.send_nudges() from anon;
revoke all on function public.send_nudges() from authenticated;
