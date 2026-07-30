import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClaimEmail } from '@/components/claim-email'
import { DeclineInvite, SayNothing } from '@/components/decline-invite'
import { EntryForm } from '@/components/entry-form'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Card, Notice, Screen, Wordmark } from '@/components/ui'
import { hashToken } from '@/lib/invite/token'
import { isConfigured } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'
import { loadHome } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * The invite claim screen.
 *
 * A leaked or forwarded link exposes exactly two things: the inviter's first
 * name, and the fact that they use Sync. No answers, no menu, nothing else —
 * the invitee sees none of the inviter's content until they have an account of
 * their own and the reveal has fired.
 *
 * Once claimed, this URL stops being an invitation and becomes a recovery door:
 * it can only send a sign-in code to the address already on the account, so
 * holding the link on its own grants nothing.
 */

type PeekState =
  | { state: 'unknown' }
  | { state: 'revoked' }
  | { state: 'expired'; inviter_first_name: string | null }
  | { state: 'claimed'; inviter_first_name: string | null }
  | { state: 'claimed_by_you'; inviter_first_name: string | null }
  | { state: 'declined'; inviter_first_name: string | null }
  | { state: 'open'; inviter_first_name: string | null; pair_id: string }

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  if (!isConfigured()) return <SetupNotice />

  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('peek_invite', {
    p_token_hash: hashToken(decodeURIComponent(token)),
  })

  if (error) {
    return (
      <Frame title="Something went wrong.">
        <Notice tone="error">{error.message}</Notice>
      </Frame>
    )
  }

  const peek = data as PeekState

  // loadHome rather than getMe, because this screen has to know whether the
  // visitor is already in a pairing. It did not before: the branch below carried a
  // comment claiming "no pairing of their own" and checked only that a name
  // existed, so somebody already synced saw the whole invitation, filled the form,
  // and got a raw Postgres error for their trouble.
  const home = await loadHome()
  const me = home?.me ?? null

  // Already in this pairing — nothing to claim.
  if (peek.state === 'claimed_by_you') redirect('/')

  if (peek.state === 'unknown' || peek.state === 'revoked') {
    return (
      <Frame title="This link isn’t live.">
        <p className="t-body text-ink-muted">
          {peek.state === 'revoked'
            ? 'It was cancelled by whoever sent it. Ask them for a fresh one.'
            : 'It may have been mistyped, or cancelled. Ask for a fresh one.'}
        </p>
      </Frame>
    )
  }

  if (peek.state === 'declined') {
    return (
      <Frame title="You turned this one down.">
        <p className="t-body text-ink-muted">
          {peek.inviter_first_name
            ? `${peek.inviter_first_name} knows you can’t join, and not why. If that changes, ask them for a fresh link.`
            : 'Whoever sent it knows you can’t join, and not why. If that changes, ask them for a fresh link.'}
        </p>
      </Frame>
    )
  }

  if (peek.state === 'expired') {
    return (
      <Frame title="This link has expired.">
        <p className="t-body text-ink-muted">
          Invite links last seven days.{' '}
          {peek.inviter_first_name
            ? `Ask ${peek.inviter_first_name} to send another.`
            : 'Ask for another.'}
        </p>
      </Frame>
    )
  }

  if (peek.state === 'claimed') {
    // Two readings, and the screen can't distinguish them: somebody else got
    // there first, or this is the original person coming back on a device that
    // lost the session. Recovery is offered rather than assumed.
    return (
      <Frame title="This link has already been used.">
        <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
          <p className="t-body text-ink-muted">
            If that was you on another browser, put in the email you attached and we’ll
            send a code. If you never attached one,{' '}
            {peek.inviter_first_name ?? 'whoever invited you'} can undo the pairing and
            send a new link.
          </p>
          <Card>
            <ClaimEmail reason="We'll only send a code if this address is already on the account." />
          </Card>
        </div>
      </Frame>
    )
  }

  const inviter = peek.inviter_first_name ?? 'Someone'

  // Their own pairing's link. Inviters do click their own link to check it works,
  // and without this they were shown "You want to sync with you."
  if (home?.pair && peek.pair_id === home.pair.id) redirect('/')

  /**
   * Already synced with somebody, so this cannot be claimed.
   *
   * Gated on a partner existing rather than merely on having a pair, because
   * claim_invite deliberately DOES let a still-empty pending pairing be traded for
   * this one — that is the "we both sent links at the same moment" case, and it
   * must keep working.
   */
  if (home?.pair && home.partner) {
    return (
      <Frame title={`You’re already synced with ${home.partner.firstName}.`}>
        <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
          <p className="t-body text-ink-muted">
            {inviter} sent you this. Sync only works one pairing at a time — the
            streak, the tender and the vault all belong to the two of you — so
            there&rsquo;s nothing here to accept without ending what you already have.
          </p>

          <div className="rounded-[0.875rem] border border-hairline bg-paper-sunken p-4">
            <p className="t-body text-ink">If you did mean to switch</p>
            <p className="t-small mt-1 text-ink-muted">
              You&rsquo;d have to end your pairing with {home.partner.firstName} first,
              from Settings. That is not a small thing: it stops the streak, and it
              asks what to do with any letters still sealed between you. Nothing about
              it is undone by coming back here afterwards.
            </p>
            <div className="mt-3">
              <Link href="/settings" className="block">
                <Button variant="quiet">Open Settings</Button>
              </Link>
            </div>
          </div>

          <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
            <DeclineInvite token={decodeURIComponent(token)} inviter={inviter} />
            <SayNothing />
          </div>
        </div>
      </Frame>
    )
  }

  // Signed in already, with no pairing of their own — claim without re-asking
  // for a name they've already given.
  if (me?.firstName) {
    return (
      <Frame title={`${inviter} wants to sync with you.`}>
        <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
          <p className="t-body text-ink-muted">
            One question a day. You each answer it twice — once for yourself, once as a
            guess at the other. Neither of you sees anything until you both have.
          </p>
          <EntryForm inviteToken={decodeURIComponent(token)} inviterFirstName={inviter} />
          <p className="t-small text-ink-faint">
            Signed in as {me.firstName}. If that isn&rsquo;t the account you meant,{' '}
            <Link
              href="/signin"
              className="text-ink-muted underline decoration-hairline underline-offset-4"
            >
              sign in as someone else
            </Link>{' '}
            before joining &mdash; a pairing follows the account that claims it.
          </p>
        </div>
      </Frame>
    )
  }

  return (
    <Frame title={`${inviter} wants to sync with you.`}>
      <div className="stack" style={{ ['--stack-gap' as string]: '2rem' }}>
        <p className="t-body text-ink-muted">
          One question a day, the same one for both of you. You each answer it twice —
          once honestly, once guessing what the other will say. Neither of you sees
          anything until you both have.
        </p>

        <EntryForm inviteToken={decodeURIComponent(token)} inviterFirstName={inviter} />

        {/*
          The way out for anybody who already has an account.
          
          This screen used to offer signing up and nothing else — there was no route
          to /signin anywhere on it. That is not a missing convenience, it is a trap,
          and it cost somebody their pairing: open an invite link in a browser without
          a session and the only available action creates a SECOND account, complete
          with a fresh profile, leaving the real one behind. Then claim_invite refuses
          (your own link, or already paired), so you land on "let's set your pairing
          up" and go round again on an account that isn't yours.
          
          It happens constantly and through no fault of the user, because invite links
          are sent over WhatsApp and open in an in-app browser whose cookies are not
          Safari's. Being signed in on the phone is not being signed in here.
        */}
        <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
          <p className="t-small text-ink-muted">
            Already using Sync?{' '}
            <Link
              href="/signin"
              className="text-ink underline decoration-hairline-strong underline-offset-4"
            >
              Sign in instead
            </Link>{' '}
            &mdash; signing up here would start a second account and leave your streak
            behind.
          </p>
          <p className="t-small text-ink-faint">
            <strong className="font-medium text-ink-muted">
              If you sent this link yourself,
            </strong>{' '}
            you don&rsquo;t need it. Sign in and it&rsquo;s on your own screen, ready to
            re-send.
          </p>
        </div>

        <p className="t-small text-ink-faint">
          No account yet? Then the form above is all it takes &mdash; no password. If
          you&rsquo;re reading this inside another app&rsquo;s browser, open it in Safari
          or Chrome first, or you may not stay signed in.
        </p>
      </div>
    </Frame>
  )
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '2rem' }}>
        {/* Not a link here. Wandering off this screen means signing up without
            the token, which makes a pairing of your own and leaves the invite
            unclaimable. Leaving is still offered below, deliberately and named. */}
        <Wordmark size="lg" href={null} />
        <h1 className="t-question text-ink">{title}</h1>
        {children}
        <Link href="/" className="block">
          <Button variant="ghost">Go to Sync</Button>
        </Link>
      </div>
    </Screen>
  )
}
