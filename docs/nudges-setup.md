# Turning nudges on

The decision engine is already in the database (migration `0010_nudges.sql`) and
tested. What's left is the part that needs a secret, which is yours to hold — I
never see it and it never reaches the web app.

Three steps, all in the Supabase dashboard.

## Why it works this way

Sending mail needs two things the app deliberately cannot do: read every user's
email address, and read across pairs. There is no `service_role` key anywhere in
this app, on purpose — it's what guarantees no code path can reach a partner's
un-revealed answer. Giving the web app a privileged key just to send reminders
would trade that away for a feature that doesn't need it.

So the whole job runs inside Postgres. Addresses never leave the database.

## 1. Enable two extensions

**Database → Extensions**, enable:

- **`pg_cron`** — runs the job on a schedule
- **`pg_net`** — lets Postgres make the HTTP call to Resend

## 2. Store the Resend API key

Get a key from Resend (**API Keys → Create**, send-only permission is enough).
Then in the **SQL Editor**, replacing the placeholder with your real key:

```sql
-- Vault is Supabase's encrypted secret store. The key is not readable from the
-- API and never appears in a query result.
select vault.create_secret('re_your_real_key_here', 'resend_api_key');
```

If `vault` isn't available on your plan, a private table works — but then the key
is readable by anything with database access, so prefer Vault.

## 3. Create the job

Paste this whole block. It sends at most one of each kind of nudge per person per
day, because `claim_nudge` uses a unique index to arbitrate — two overlapping runs
cannot both mail the same person.

```sql
create or replace function public.send_nudges()
returns int
language plpgsql
security definer
set search_path = public, pg_temp, vault
as $$
declare
  r        record;
  v_key    text;
  v_sent   int := 0;
  v_subject text;
  v_body    text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'resend_api_key';

  if v_key is null then
    raise notice 'no resend_api_key in vault — nothing sent';
    return 0;
  end if;

  for r in select * from public.nudge_queue(20) loop
    -- Claim first. If somebody else already claimed it, skip without sending.
    if not public.claim_nudge(r.pair_id, r.user_id, r.kind, r.day_index) then
      continue;
    end if;

    if r.kind = 'partner_answered' then
      v_subject := coalesce(r.partner_first_name, 'Your person') || ' has answered';
      v_body := '<p>' || coalesce(r.partner_first_name, 'Your person') ||
        ' answered today''s question. Neither of you sees anything until you have too.</p>';
    elsif r.kind = 'closing_soon' then
      v_subject := 'Today''s question closes tonight';
      v_body := '<p>Today''s question is still open. Thirty seconds keeps the streak.</p>';
    else
      v_subject := 'Something was asked of you';
      v_body := '<p>' || coalesce(r.partner_first_name, 'Your person') ||
        ' asked for something from your menu. No clock on it — whenever you like.</p>';
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
        'html', v_body ||
          '<p><a href="https://syncin.love">Open Sync</a></p>' ||
          '<p style="color:#64748b;font-size:12px">Don''t want these? ' ||
          'Turn them off under Settings.</p>'
      )
    );

    perform public.mark_nudge_sent(r.pair_id, r.user_id, r.kind, r.day_index);
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.send_nudges() from public;
revoke all on function public.send_nudges() from authenticated, anon;

-- Hourly. The job itself decides who is actually in their own evening, because
-- every pair keeps its own timezone — which is why this can run hourly and still
-- only ever mail people at a sensible local hour.
select cron.schedule('sync-nudges', '0 * * * *', 'select public.send_nudges()');
```

## Checking it

```sql
-- Who is currently owed something
select kind, count(*) from public.nudge_queue(20) group by kind;

-- What has been sent
select kind, count(*), max(sent_at) from public.notifications group by kind;

-- Job history
select * from cron.job_run_details order by start_time desc limit 10;
```

## Turning it off

```sql
select cron.unschedule('sync-nudges');
```

Individual people can switch each kind off under Settings without touching this.

## Before you enable it

The `from` address must be on a domain verified in Resend. `syncin.love` is
verified; `noreply@syncin.love` is what the block above uses. If you'd rather send
as something else, change it in both places.

Worth sending yourself one first: set the schedule to `'*/5 * * * *'`, wait, check
`cron.job_run_details`, then put it back to hourly.
