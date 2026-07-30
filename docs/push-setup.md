# Push notifications and haptics

Three separate things, often confused. Only one of them needed building.

| | iPhone / iPad | Android | Desktop |
|---|---|---|---|
| Install to home screen | worked already | worked already | worked already |
| Push notifications | **iOS 16.4+, installed only** | yes | yes |
| Vibration | **never — Apple has not implemented it** | yes | no motor |

## Install

Already worked before any of this. `src/app/manifest.ts` plus the `appleWebApp`
metadata in `layout.tsx` is the whole requirement, and both were in place.

What was missing was anybody being *told*. On iOS there is no install prompt of
any kind — Apple does not fire `beforeinstallprompt` — so a user has to find
Share → Add to Home Screen unaided, and nobody does. Settings now has a **This
device** card that gives the actual steps on iOS, points at the browser's own
install control elsewhere, and says "Installed" once you are running from the
home screen.

That card matters more than it looks: on iPhone, installing is a hard
prerequisite for notifications, not a nicety.

## Haptics

Built, and honest about where it does nothing.

`navigator.vibrate` is the only haptic API the web has, and Safari does not
implement it — installed to the home screen or not. So on iOS every call is a
no-op and the Settings toggle is hidden entirely, replaced by one sentence saying
why. A switch that does nothing when flipped is the clearest possible way to look
broken.

There is a widely-copied trick that borrows the system toggle haptic via a hidden
`<input type="checkbox" switch>`. It only fires on a genuine user tap of that
element, cannot be driven from a reveal animation or a server response, and breaks
whenever Apple adjusts it. Not used here.

Where it does work (Android), it fires on three things: moving from your own
answer to your guess, sealing both answers, and the moment the reveal breaks its
seal. Reduced-motion preferences suppress the reveal buzz — somebody who asked for
less movement did not ask for a phone that jumps in their hand.

Code: `src/lib/haptics.ts`. The preference lives in `localStorage`, so it is
per-device, defaults on where supported, and needs no migration.

## Push

This one needed real work, and one architectural decision.

### Why there is a relay

Web push requires a VAPID JWT signed with ECDSA P-256. Postgres cannot do that —
pgcrypto has no ECDSA signing — so unlike the Resend calls, `send_nudges()` cannot
POST straight to the push service.

The easy fix would have been a Next.js route holding a `service_role` key,
querying the nudge queue itself. That key can read every un-revealed answer in the
database. "No code path can read your partner's answer before you have answered"
is the product, not a feature of it, so that was not on the table.

Instead the decision stays where it already is:

```
pg_cron ─► send_nudges()          decides who and what      (Postgres, as today)
             ├─► Resend                                     email, unchanged
             └─► POST /api/push   one per registered device
                   └─► signs with VAPID, forwards to Google/Apple/Mozilla
```

`/api/push` holds the VAPID private key and a shared secret. It holds **no
database credentials**, has no query interface, and cannot ask the database
anything. Fully compromised, an attacker gains the ability to send notifications
to people who already opted into notifications, and nothing else.

Its one write-back — marking an endpoint dead after a 404/410 — goes through
`retire_push_endpoint`, which authorises on the shared secret and is reached with
the anon key.

### Payloads carry no content

Not a question, not an answer, not a letter's title. A lock screen is a public
surface, and this app assumes phones get read over shoulders. Notifications say
that something happened and where to look.

### Setting it up

**1. Keys.** Already generated into `.env.local` (gitignored):

```bash
grep VAPID .env.local
```

To generate a fresh set instead:

```bash
npx web-push generate-vapid-keys
```

**2. Vercel.** Add all three from `.env.local` to the project's environment
variables, for Production and Preview:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — safe to expose; it ships in the client bundle
- `VAPID_PRIVATE_KEY` — server only
- `PUSH_RELAY_SECRET` — server only

**3. Postgres.** The same secret has to be on both sides. In the SQL editor, with
the value from `.env.local`:

```sql
update public.private_config
set value = 'PASTE_THE_PUSH_RELAY_SECRET_FROM_ENV_LOCAL'
where name = 'push_relay_secret';
```

Until that is done, `send_nudges()` treats push as switched off and sends email
exactly as before. That is deliberate: a half-configured relay must not be able to
stop the channel that already worked.

**4. Check it.** After deploying:

```sql
select public.send_nudges();
```

### If nothing arrives

In order of likelihood:

- **Secret mismatch.** `private_config.push_relay_secret` versus Vercel's
  `PUSH_RELAY_SECRET`. The relay answers 401 and pg_net records it —
  `select * from net._http_response order by created desc limit 5;`
- **iOS, not installed.** Apple allows notifications only for home-screen apps.
  The Settings card says so rather than failing silently.
- **No devices registered.** `select count(*) from public.push_subscriptions;`
  Each browser has to be turned on individually, in Settings.
- **Relay not configured.** `/api/push` answers 503 when the env vars are absent —
  distinguishable from 500 on purpose.

### Tested

`supabase/tests/phase7_push.sql`, 20 assertions. The two that matter: one partner
cannot see or rewrite the other's device subscriptions, and the secret gate fails
closed on a wrong secret, a null secret, and an unconfigured relay.

The relay's own gates were checked against the running dev server: a valid secret
with a non-push host is still refused, which keeps this from being a general
outbound request forwarder sitting inside our own infrastructure.
