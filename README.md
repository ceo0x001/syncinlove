# SyncinLove

One question a day, for two people. Each partner answers it twice — once
honestly for themselves, once guessing what the other will say. Neither sees
anything until both have submitted. Then it opens, with a score for how well
they read each other.

Production domain: **syncin.love** — served on **www.syncin.love**. The apex
308-redirects there, and `net.http_post` does not follow redirects, so anything
server-side (pg_cron jobs, health checks, curl) must use the `www` host or it will
silently receive the redirect and stop.

**Phases 1–4 shipped; phase 5 is all but done.** The loop, the reveal, tender and
menus, the letter vault and the Rich List are live, along with a good deal that was
never on the plan — see [Roadmap](#roadmap) for what is actually left.

## Brand

| Token | Hex | Use |
|---|---|---|
| Primary Coral | `#FF6B6B` | Buttons, key CTAs, highlights |
| Secondary Pink | `#F43F8E` | Gradients, accents |
| Gradient | `#F43F8E → #FF6B6B → #FF8A3D` | Primary CTAs; a very soft page wash |
| Deep Midnight | `#0F172A` | Headings and UI text |
| Warm White | `#FFFCFA` | Background |
| Soft Peach | `#FFF3F0` | Cards |
| Success / Warning / Error / Info | `#22C55E` `#F59E0B` `#EF4444` `#3B82F6` | Semantic states |

All of these are CSS custom properties in [globals.css](src/app/globals.css),
with a dark theme derived from Deep Midnight. Assets live in `public/brand/`;
`src/app/icon.png` and `src/app/apple-icon.png` are picked up automatically by
Next as the favicon and home-screen icon.

**One accessibility note.** White on Primary Coral measures 2.8:1, which fails
WCAG AA (4.5:1) and even AA-large (3:1). Primary buttons therefore use the brand
gradient rather than flat coral, since leading with the pink lifts it to ~3.5:1 —
better, still short of AA. If you want it to pass properly, the fix is a darker
coral for interactive surfaces only (around `#D6455F`), keeping `#FF6B6B` for
display. Flagging rather than deciding, since it's a brand call.

---

## Setup

Four steps, about five minutes. The app shows a setup screen until they're done.

### 1. Create a Supabase project

At [supabase.com/dashboard](https://supabase.com/dashboard). Free tier is fine.
Then open **Project Settings → API** and copy two values into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

The key is labelled *anon public* on older projects and *Publishable key* on
newer ones. Either works. The `service_role` / secret key is deliberately not
used anywhere — see [Security](#security).

`INVITE_SECRET` is already generated in your `.env.local`. Keep it; changing it
invalidates every outstanding invite link.

### 2. Turn on anonymous sign-ins

**Authentication → Sign In / Providers → Anonymous sign-ins.**

This is what lets an invited partner start answering before they have an
account. Without it, the first screen fails with a clear error.

### 3. Run the SQL

Paste into the **SQL editor**, in order:

1. Every file in `supabase/migrations/`, in filename order — `0001` through the
   highest number present. They are not idempotent as a set and later ones assume
   earlier ones; running them out of order fails in ways that are tedious to unpick.
2. `supabase/seed/questions.sql`

The seed is generated from the TypeScript question bank. After editing anything in
`src/lib/questions/bank/`, run `npm run seed:questions` and paste it again.

Two of these need a step after the SQL: `0010` wants `pg_cron` and `pg_net` enabled
plus a Resend key in `private_config` ([docs/nudges-setup.md](docs/nudges-setup.md)),
and `0017` wants VAPID keys and a relay secret
([docs/push-setup.md](docs/push-setup.md)). Both are inert until then, deliberately —
a half-configured channel must not be able to break one that already works.

### 4. Make the email code a code

**Authentication → Emails → Change Email Address.** Make sure the template
includes `{{ .Token }}`, which renders the numeric code. Its length is a
project setting (Authentication → Sign In / Providers → Email → OTP length,
6-10); the app accepts any length in that range rather than assuming 6.

This matters more than it looks. A magic link tapped from a mail app often opens
in a *different browser* than the one holding the anonymous session — so the
upgrade-in-place fails exactly when it's needed, and the user ends up with two
accounts. A typed code keeps everything in one browser context.

> **Note on email limits.** Supabase's built-in mailer allows only a few messages
> per hour. That's enough to test with, but connect your own SMTP (Resend's free
> tier is plenty) before real people use this.

Then:

```bash
npm run dev
```

Restart after editing `.env.local` — Next only reads it at boot.

---

## How it fits together

```
src/lib/questions/     the bank: 30 questions, typed, hand-ordered
src/lib/sync/score.ts  scoring — pure arithmetic, no model
src/lib/sync/day.ts    the pair calendar: day index, 30-hour window, streak
src/lib/invite/        HMAC-signed invite links
src/lib/session.ts     one loader for everything the home screen needs
src/app/actions.ts     every mutation, each re-checking auth itself
supabase/migrations/   schema, RLS, and the scoring function
supabase/tests/        assertions run against a throwaway cluster
```

### Two things worth knowing before changing anything

**The question bank is the product.** The app is a weekend; thirty questions
that are specific, answerable in two taps and not embarrassing took longer.
`SEQUENCE` in `bank.ts` is hand-ordered so the first week stays light — a pair
whose second question is *"what do you suspect I don't fully know about you"*
does not come back for a third. Keep the ramp.

**Scoring lives in two places, and SQL is the authority.** `score.ts` renders
and tests; the plpgsql inside `submit_answer()` is what actually pays out,
because it is the only thing that can see both answers at once. The same
fixtures are asserted in both suites so they can't drift apart quietly.

---

## Security

The load-bearing promise is: **no person can read their partner's answer.** Not
before the reveal, not after.

That isn't enforced by a policy meaning *"you may read their answer once you've
also submitted"*. That predicate is subtle and its failure mode is silent. Instead:

- `answers` is readable **only by its author**. There is no policy under which a
  partner can read it, so there is no predicate to get wrong.
- There is no `INSERT` grant on `answers`. `submit_answer()` is the only way in,
  so the window check and validation can't be bypassed.
- No `UPDATE` or `DELETE` grant exists at all, which is what makes a submission
  immutable.
- When the second answer lands, a `SECURITY DEFINER` function computes the score
  and writes a separate `reveals` row both partners may read.

Consequence: **the app never needs a `service_role` key**, and no bug in
application code can expose an un-revealed answer, because no code path in the
app can reach one.

Also true today: no user content is ever sent to any AI model. The question bank
is hand-written and scoring is arithmetic.

### Verifying it

```bash
npm run test:sql
```

Spins up a disposable Postgres cluster, applies the real migration unmodified,
and asserts its way through the loop — including connecting as a genuine
non-owner role and confirming one partner cannot read the other's answer even
after the reveal. Nothing touches your Supabase project.

```bash
npm test
```

Scoring calibration, the pair calendar, the grace window, streaks, bank integrity.

### Clearing out test data

[supabase/maintenance/cleanup.sql](supabase/maintenance/cleanup.sql) has an
inventory query, the orphaned-anonymous-account sweep (still manual), and a full
reset. Run the inventory first — the destructive
parts are commented out deliberately.

---

## Design notes

A few decisions that look like details and aren't:

**The slider shows no number.** A readout turns the question into a test — you
start optimising digits instead of answering. The reveal draws the gap as two
marks on one track, which lands immediately in a way "70 vs 45" doesn't.

**Choices have no default.** A pre-selected option is an answer nobody gave,
feeding a score that will pay out.

**Scale scoring doubles the distance.** Plain `100 - distance` leaves a random
guesser at 66 and every couple looks psychic. Doubled, a whole question's random
baseline sits near 33, against the 75–95 an attuned pair scores.

**The waiting screen shows the shape of the reveal.** The most likely way this
app dies is somebody answering, hitting the invite wall, and their partner never
coming. They see the real layout with the partner's side sealed, so they leave
having seen what they're waiting for.

**Notifications will never contain content.** "Ada answered. Your reveal is
ready." Nothing else, ever — it's both a spoiler and, for someone in a bad
relationship, a safety problem.

---

## Deployment

Live on Vercel under the `webuildcore` scope, project `syncinlove`. Deploy with:

```bash
vercel deploy --prod
```

### Environment variables

Set in Vercel for **production** and **preview**. Preview deliberately omits
`NEXT_PUBLIC_SITE_URL` so `siteUrl()` falls back to Vercel's own host vars —
otherwise every invite generated on a preview would point at localhost.

| Variable | Production value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `NEXT_PUBLIC_SITE_URL` | `https://www.syncin.love` — the www host, per the note at the top |
| `INVITE_SECRET` | a **different** value from local, so dev and production invite links stay isolated |

### If a deploy is "blocked because the commit author did not have contributing access"

This is not a plan limit, and upgrading won't fix it. Vercel resolves the
**commit author's email** to a user with project access; if the email doesn't
match your account, it reads the commit as coming from a collaborator, which
Hobby doesn't allow on private repos. Check with:

```bash
git log -1 --format='%ae'
```

If it's wrong, re-author and force-push:

```bash
git rebase <last-good-sha> --exec 'git commit --amend --no-edit --reset-author'
```

### Deployment Protection

New projects default to `ssoProtection: all_except_custom_domains`, which serves
a Vercel login page on `*.vercel.app`. The custom domain is unaffected, but it
blocks testing a deployment before DNS resolves. Turn it off under
**Settings → Deployment Protection**.

### DNS

The domain is registered at Namecheap, so DNS stays there and Vercel just needs
records pointing at it:

| Type | Host | Value |
|---|---|---|
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |

Check propagation with `vercel domains inspect syncin.love`.

## Email

Supabase's built-in mailer allows only a few messages per hour **and** won't let
you edit templates at all — which matters, because the Change Email template
needs `{{ .Token }}` to send a numeric code rather than only a link. Custom
SMTP unlocks both.

1. **Resend** — create an account, add `syncin.love` as a sending domain, and
   put the SPF/DKIM records it gives you into Namecheap. Then create an API key.
2. **Supabase → Project Settings → Authentication → SMTP Settings**, enable
   custom SMTP:
   - Host `smtp.resend.com`, Port `465`
   - Username `resend`, Password *the Resend API key*
   - Sender `noreply@syncin.love`, Name `SyncinLove`
3. **Supabase → Authentication → Emails → Change Email Address** — the template
   is now editable. Make sure the body includes `{{ .Token }}`.
4. **Supabase → Authentication → URL Configuration** — set Site URL to
   `https://www.syncin.love`.

Until step 3 is done, the email claim sends a link instead of a code. That works
when it opens in the same browser, and silently doesn't when it doesn't — which
is the common case, because most invite links get tapped inside WhatsApp's
in-app browser and reopened elsewhere. Treat it as required before real couples
use this, not optional.

---

## Roadmap

| Phase | What lands | Status |
|---|---|---|
| 1 | The loop: answer, guess, invite, gated reveal, sync score, streak | **done** |
| 2 | The reveal as a showpiece, plus the share card | **done** |
| 3 | Tender: wallets, menus, purchase and refund | **done** |
| 4 | Letter vault, export, burn everything, unpair | **done** |
| 5 | Nudges, freeze days, question bank to 90+, the Rich List | **freeze days done; bank at 84** |

Built since, none of it on the original plan: the admin dashboard, web push with a
signing relay, PWA install and haptics, a history view, sign-in with an emailed
code, invite reissue and decline, and the How Sync Works guide.

**The one number still short of the plan is the question bank: 84 against the 90+
above.** Worth knowing that 90 was never the real target — a repeat-free two years
needs roughly 730, so measured against the actual goal the bank is barely started.
Light and logistics questions are the binding constraint; there is no shortage of
heavy or intimate ones.

Phase 3 note: record earnings as **ledger entries, not a balance counter**. The
Rich List ranks on tender *earned*, never held — ranking on balance would
publish a leaderboard of couples who never spend anything on each other, and put
a price on the one behaviour the product exists to encourage.
