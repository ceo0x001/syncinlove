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

## 2. Store the key, and create the job

Vault turned out not to be available on this project, so the key lives in a table
instead — `public.private_config`, with RLS on and no policies at all, which makes
it unreachable through the API, plus the privileges revoked outright. Only a
SECURITY DEFINER function running as the owner can read it.

The honest tradeoff: this is weaker than Vault, because the value sits
unencrypted rather than encrypted at rest. Anything holding direct database
credentials can read it. If Vault appears on the plan later, move the key and
change the one lookup in `send_nudges`.

Everything — the table, the key, the function and the schedule — is in
[`supabase/maintenance/nudge_job.sql`](../supabase/maintenance/nudge_job.sql).
Open it, replace `re_PASTE_YOUR_KEY_HERE` with your real key **keeping the single
quotes**, and run the whole file. Unquoted is what breaks it: Postgres reads a
bare key as a column name and answers `42703 column does not exist`.

It starts on a five-minute schedule so you can watch one arrive, and the last
comment block in the file shows how to move it to hourly.

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
