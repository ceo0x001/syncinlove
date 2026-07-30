-- ============================================================================
-- The nudge sending job.
--
-- Run this ONCE, after editing the one marked line below to hold your real
-- Resend key. Everything else is safe to re-run.
--
-- Vault isn't available on this project, so the key lives in a table instead.
-- That table is locked down two ways: RLS is on with NO policies at all, which
-- makes it unreachable through the API by anon or authenticated, and the
-- privileges are revoked outright as well. Only a SECURITY DEFINER function
-- running as the owner can read it.
--
-- Be clear-eyed about the tradeoff: this is weaker than Vault, because the value
-- sits in the table unencrypted rather than encrypted at rest. Anything with
-- direct database credentials can read it. If Vault becomes available later,
-- move the key there and change the one lookup in send_nudges.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Somewhere to keep the key
-- ----------------------------------------------------------------------------

create table if not exists public.private_config (
  name       text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.private_config enable row level security;

-- Deliberately no policies. RLS with zero policies denies everything, so this is
-- invisible to every API caller. The revokes below are belt and braces.
revoke all on table public.private_config from anon, authenticated;

comment on table public.private_config is
  'Secrets the nudge job needs. No RLS policies exist on purpose — nothing '
  'reachable through the API can read this, only SECURITY DEFINER functions.';


-- ----------------------------------------------------------------------------
-- 2. Your key
--
--    >>> REPLACE re_PASTE_YOUR_KEY_HERE WITH YOUR REAL RESEND KEY <<<
--
--    Keep the single quotes. They are what stopped the Vault attempt working —
--    without them Postgres reads the key as a column name.
-- ----------------------------------------------------------------------------

insert into public.private_config (name, value)
values ('resend_api_key', 're_PASTE_YOUR_KEY_HERE')
on conflict (name) do update
  set value = excluded.value,
      updated_at = now();


-- ----------------------------------------------------------------------------
-- 3. The job
--
-- Claims each nudge before sending it. claim_nudge inserts against a unique
-- index and returns whether it won, so two overlapping runs can never both mail
-- the same person — the insert IS the lock.
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

  -- 20 = the pair-local hour after which "the day is closing" is fair to say.
  -- Evaluated per pair against its own timezone, which is why this can run
  -- hourly and still only ever mail people in their own evening.
  for r in select * from public.nudge_queue(20) loop

    if not public.claim_nudge(r.pair_id, r.user_id, r.kind, r.day_index) then
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

    perform public.mark_nudge_sent(r.pair_id, r.user_id, r.kind, r.day_index);
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.send_nudges() from public;
revoke all on function public.send_nudges() from anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. The schedule
--
-- Every five minutes to start with, so you can watch one arrive. Move it to
-- hourly once you have — see the bottom of this file.
-- ----------------------------------------------------------------------------

select cron.unschedule('sync-nudges')
where exists (select 1 from cron.job where jobname = 'sync-nudges');

select cron.schedule('sync-nudges', '*/5 * * * *', 'select public.send_nudges()');


-- ============================================================================
-- Checking it
--
--   select public.send_nudges();                    -- run it by hand, returns a count
--   select kind, count(*) from public.nudge_queue(20) group by kind;
--   select kind, sent_at from public.notifications order by created_at desc limit 10;
--   select * from cron.job_run_details order by start_time desc limit 5;
--
-- Once an email has arrived, slow it down:
--
--   select cron.unschedule('sync-nudges');
--   select cron.schedule('sync-nudges', '0 * * * *', 'select public.send_nudges()');
--
-- Turning it off entirely:
--
--   select cron.unschedule('sync-nudges');
-- ============================================================================
