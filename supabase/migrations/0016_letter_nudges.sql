-- ============================================================================
-- Telling people about letters.
--
-- Two gaps the vault had. A letter's unlock date arrived and nothing said so —
-- it simply appeared, and only if you happened to look. And a sender who sealed
-- something for a date a year out never learned whether it was read.
--
-- Both go through the existing nudge machinery rather than a new mechanism, so
-- they inherit the parts that were hard: one send per thing ever, a preference
-- that silences them, and nothing sent to an account with no confirmed address.
--
-- ONE THING THIS MUST NOT BREAK
--
-- A recipient can destroy a sealed letter without reading it, and the sender is
-- never told. That is deliberate — somebody should be able to decline a message
-- from a relationship that went wrong without reading it and without explaining.
-- So the "opened" nudge fires on opened_at only. A destroyed letter sets nothing
-- and notifies nobody, which is exactly the silence that was promised.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Preference, and the new kinds
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists notify_letters boolean not null default true;

comment on column public.profiles.notify_letters is
  'A letter of yours became readable, or one you sealed was opened.';

-- day_index carries the letter id for these two kinds, so the existing
-- one-per-thing unique index does the deduplication unchanged. It cannot: it is
-- an int. So a separate column instead, and the index widened to include it.
alter table public.notifications
  add column if not exists letter_id uuid references public.letters (id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'closing_soon', 'partner_answered', 'request',
    'letter_ready',   -- to the recipient: it is readable now
    'letter_opened'   -- to the sender: they read it
  ));

drop index if exists notifications_once;
create unique index notifications_once
  on public.notifications (
    pair_id, user_id, kind,
    coalesce(day_index, -1),
    coalesce(letter_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );


-- ----------------------------------------------------------------------------
-- The queue, extended
-- ----------------------------------------------------------------------------

/**
 * Everyone owed a nudge, now including letters.
 *
 * The two letter kinds return the letter id rather than a day index, and
 * deliberately return no title or body — the whole point of a sealed letter is
 * that its contents live nowhere but the vault, and an email is the last place
 * they should turn up.
 */
-- Dropped rather than replaced: the return type gains letter_id, and
-- `create or replace` cannot change a function's shape.
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
  letter_id  uuid
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
        as partner_first_name
    from people pe
  ),
  candidates as (
    select s.pair_id, s.user_id, s.email, s.first_name,
           'partner_answered'::text as kind, s.today as day_index,
           s.partner_first_name, null::uuid as letter_id
    from state s
    where s.notify_partner
      and coalesce(s.they_answered, false)
      and not coalesce(s.i_answered, false)
      and not coalesce(s.revealed, false)

    union all

    select s.pair_id, s.user_id, s.email, s.first_name,
           'closing_soon', s.today, s.partner_first_name, null::uuid
    from state s
    where s.notify_reminders
      and s.local_hour >= p_evening_hour
      and not coalesce(s.i_answered, false)

    union all

    select distinct s.pair_id, s.user_id, s.email, s.first_name,
           'request', null::int, s.partner_first_name, null::uuid
    from state s
    join public.purchases pu
      on pu.pair_id = s.pair_id
     and pu.seller_id = s.user_id
     and pu.status = 'requested'
    where s.notify_requests

    union all

    -- A letter addressed to them has reached its date and is still unread.
    select s.pair_id, s.user_id, s.email, s.first_name,
           'letter_ready', null::int, s.partner_first_name, le.id
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
           'letter_opened', null::int, s.partner_first_name, le.id
    from state s
    join public.letters le
      on le.pair_id = s.pair_id
     and le.sender_id = s.user_id
     and le.opened_at is not null
    where s.notify_letters
  )
  select c.pair_id, c.user_id, c.email, c.first_name, c.kind, c.day_index,
         c.partner_first_name, c.letter_id
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
revoke all on function public.nudge_queue(int) from authenticated, anon;


-- ----------------------------------------------------------------------------
-- Claiming, now letter-aware
-- ----------------------------------------------------------------------------

drop function if exists public.claim_nudge(uuid, uuid, text, int);
drop function if exists public.mark_nudge_sent(uuid, uuid, text, int);

create function public.claim_nudge(
  p_pair_id   uuid,
  p_user_id   uuid,
  p_kind      text,
  p_day_index int,
  p_letter_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (pair_id, user_id, kind, day_index, letter_id)
  values (p_pair_id, p_user_id, p_kind, p_day_index, p_letter_id);
  return true;
exception when unique_violation then
  return false;
end;
$$;

create function public.mark_nudge_sent(
  p_pair_id   uuid,
  p_user_id   uuid,
  p_kind      text,
  p_day_index int,
  p_letter_id uuid default null
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
    and coalesce(letter_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_letter_id, '00000000-0000-0000-0000-000000000000'::uuid)
$$;

revoke all on function public.claim_nudge(uuid, uuid, text, int, uuid) from public;
revoke all on function public.claim_nudge(uuid, uuid, text, int, uuid) from anon, authenticated;
revoke all on function public.mark_nudge_sent(uuid, uuid, text, int, uuid) from public;
revoke all on function public.mark_nudge_sent(uuid, uuid, text, int, uuid) from anon, authenticated;


-- ----------------------------------------------------------------------------
-- Preferences, with letters added
-- ----------------------------------------------------------------------------

drop function if exists public.update_notify_prefs(boolean, boolean, boolean);

create function public.update_notify_prefs(
  p_reminders boolean,
  p_partner   boolean,
  p_requests  boolean,
  p_letters   boolean default null
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
      notify_requests  = coalesce(p_requests, notify_requests),
      notify_letters   = coalesce(p_letters, notify_letters)
  where id = v_user;
end;
$$;

grant execute on function public.update_notify_prefs(boolean, boolean, boolean, boolean)
  to authenticated;


-- ----------------------------------------------------------------------------
-- What the recipient is told before the date arrives
--
-- sealed_for_me already returns a count and, when the sender allowed it, the
-- date. It gains days_away so the vault can say "in 9 days" rather than making
-- somebody work out a date difference in their head.
--
-- It deliberately does NOT return the sender's name. An earlier draft did, on the
-- reasoning that the notification needed it — it does not: send_nudges reads
-- partner_first_name from nudge_queue. And for the vault it would have been
-- strictly worse than what the page already has, because it has to be nulled when
-- the sender hides the date, whereas the partner's name is known unconditionally.
-- A column nothing reads is a column that quietly rots.
-- ----------------------------------------------------------------------------

drop function if exists public.sealed_for_me();

create function public.sealed_for_me()
returns table (
  letter_id  uuid,
  unlock_on  date,
  days_away  int
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_user uuid := auth.uid();
  v_pair uuid := public.current_pair_id();
  v_today date;
begin
  if v_user is null or v_pair is null then
    return;
  end if;

  select (now() at time zone p.time_zone)::date into v_today
  from public.pairs p where p.id = v_pair;

  return query
  select
    l.id,
    -- The sender's choice. Hidden stays hidden: a null date here is the surprise
    -- working, not missing data.
    case when l.date_visible then l.unlock_on else null end,
    case when l.date_visible then (l.unlock_on - v_today)::int else null end
  from public.letters l
  where l.pair_id = v_pair
    and l.recipient_id = v_user
    and l.opened_at is null
    and l.unlock_on > v_today
  order by l.unlock_on;
end;
$$;

grant execute on function public.sealed_for_me() to authenticated;


-- ----------------------------------------------------------------------------
-- The sending job, updated in place
--
-- Included here rather than left for a hand-edit because it MUST change: it now
-- has to pass the letter id through to claim_nudge. Without that, every letter
-- nudge would claim with a null id and the second one would collide with the
-- first on the unique index — so exactly one letter notification would ever be
-- sent, per person, forever.
--
-- The Resend key is read from private_config where it already lives, so nothing
-- needs re-pasting.
-- ----------------------------------------------------------------------------

create or replace function public.send_nudges()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r         record;
  v_key     text;
  v_sent    int := 0;
  v_subject text;
  v_body    text;
  v_who     text;
begin
  select value into v_key
  from public.private_config
  where name = 'resend_api_key';

  if v_key is null or v_key like '%PASTE_YOUR_KEY%' then
    raise notice 'no usable resend key in private_config — nothing sent';
    return 0;
  end if;

  for r in select * from public.nudge_queue(20) loop

    if not public.claim_nudge(r.pair_id, r.user_id, r.kind, r.day_index, r.letter_id) then
      continue;
    end if;

    v_who := coalesce(r.partner_first_name, 'Your person');

    if r.kind = 'partner_answered' then
      v_subject := v_who || ' has answered';
      v_body := '<p>' || v_who || ' answered today''s question. Neither of you '
             || 'sees anything until you have too.</p>';

    elsif r.kind = 'closing_soon' then
      v_subject := 'Today''s question closes tonight';
      v_body := '<p>Today''s question is still open. Thirty seconds keeps the '
             || 'streak.</p>';

    elsif r.kind = 'letter_ready' then
      -- Never the title, never a word of the body. A sealed letter's contents
      -- live in the vault and nowhere else, and an email is the last place they
      -- should surface.
      v_subject := 'A letter is waiting for you';
      v_body := '<p>Something ' || v_who || ' sealed for you has reached its date. '
             || 'It is in the vault whenever you are ready.</p>';

    elsif r.kind = 'letter_opened' then
      v_subject := v_who || ' read your letter';
      v_body := '<p>The letter you sealed has been opened.</p>';

    else
      v_subject := 'Something was asked of you';
      v_body := '<p>' || v_who || ' asked for something from your menu. '
             || 'No clock on it — whenever you like.</p>';
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

    perform public.mark_nudge_sent(r.pair_id, r.user_id, r.kind, r.day_index, r.letter_id);
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.send_nudges() from public;
revoke all on function public.send_nudges() from anon, authenticated;


-- ----------------------------------------------------------------------------
-- export_archive(), repaired
--
-- Changing sealed_for_me() from a jsonb array to a table broke the data export,
-- which embedded the call directly:
--
--     'letters_to_me_still_sealed', public.sealed_for_me()
--
-- A set-returning function in that scalar position no longer yields an array. It
-- collapses to a single record when one letter is sealed and errors outright when
-- two are — so the export either changed shape silently or failed, depending on
-- how many letters happened to be waiting.
--
-- This document is somebody's copy of their own relationship and the thing they
-- take with them when they leave. It does not get to be collateral damage from a
-- signature change. The shape is now pinned by an assertion in phase4_vault.sql,
-- so the next such change fails a test rather than a person.
--
-- This copy supersedes the one in 0007. Everything but the sealed-letters branch
-- is unchanged.
-- ----------------------------------------------------------------------------

create or replace function public.export_archive()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_user    uuid := auth.uid();
  v_pair_id uuid := public.current_pair_id();
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'me', (
      select jsonb_build_object('first_name', first_name, 'joined', created_at)
      from public.profiles where id = v_user
    ),
    'pair', (
      select jsonb_build_object(
        'started', day_zero, 'time_zone', time_zone, 'status', status,
        'days_together', public.completed_days(v_pair_id)
      )
      from public.pairs where id = v_pair_id
    ),
    'reveals', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'day', r.day_index, 'question', r.question_id,
          'sync_score', r.sync_score, 'at', r.revealed_at, 'detail', r.payload
        ) order by r.day_index
      ), '[]'::jsonb)
      from public.reveals r where r.pair_id = v_pair_id
    ),
    'my_answers', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'day', a.day_index, 'question', a.question_id,
          'about_me', a.self_payload, 'my_guess', a.guess_payload, 'at', a.submitted_at
        ) order by a.day_index
      ), '[]'::jsonb)
      from public.answers a where a.pair_id = v_pair_id and a.user_id = v_user
    ),
    'tender', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'amount', e.amount, 'reason', e.reason, 'day', e.day_index,
          'detail', e.detail, 'at', e.created_at
        ) order by e.created_at
      ), '[]'::jsonb)
      from public.tender_entries e
      where e.pair_id = v_pair_id and e.user_id = v_user
    ),
    'my_menu', (
      select coalesce(jsonb_agg(
        jsonb_build_object('title', m.title, 'price', m.price, 'listed', m.active)
      ), '[]'::jsonb)
      from public.menu_items m where m.pair_id = v_pair_id and m.owner_id = v_user
    ),
    'requests', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'title', pu.title, 'price', pu.price, 'status', pu.status,
          'i_asked', pu.buyer_id = v_user, 'at', pu.created_at
        ) order by pu.created_at
      ), '[]'::jsonb)
      from public.purchases pu where pu.pair_id = v_pair_id
    ),
    -- Letters written by this person in full; letters TO them only once open.
    -- A sealed letter's text is not theirs to take early by leaving.
    'letters_i_wrote', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'title', l.title, 'body', l.body,
          'unlock_on', l.unlock_on, 'opened', l.opened_at is not null
        ) order by l.unlock_on
      ), '[]'::jsonb)
      from public.letters l where l.pair_id = v_pair_id and l.sender_id = v_user
    ),
    'letters_to_me_opened', (
      select coalesce(jsonb_agg(
        jsonb_build_object('title', l.title, 'body', l.body, 'unlock_on', l.unlock_on)
        order by l.unlock_on
      ), '[]'::jsonb)
      from public.letters l
      where l.pair_id = v_pair_id and l.recipient_id = v_user and l.opened_at is not null
    ),
    -- Aggregated rather than embedded directly. sealed_for_me() returns a table
    -- now, and a set-returning call in this position collapses to a record for one
    -- row and raises 22P02-ish "more than one row" for two.
    'letters_to_me_still_sealed', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'letter_id', s.letter_id,
                  'unlock_on', s.unlock_on,
                  'days_away', s.days_away
                )
                order by s.unlock_on nulls last)
       from public.sealed_for_me() s),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.export_archive() to authenticated;
