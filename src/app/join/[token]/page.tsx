import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClaimEmail } from '@/components/claim-email'
import { EntryForm } from '@/components/entry-form'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Card, Notice, Screen, Wordmark } from '@/components/ui'
import { hashToken } from '@/lib/invite/token'
import { isConfigured } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'
import { getMe } from '@/lib/session'

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
  const me = await getMe()

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

        <p className="t-small text-ink-faint">
          No account, no password. If you’re reading this inside another app’s browser,
          it’s worth opening it in Safari or Chrome first so you stay signed in.
        </p>
      </div>
    </Frame>
  )
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '2rem' }}>
        <Wordmark size="lg" />
        <h1 className="t-question text-ink">{title}</h1>
        {children}
        <Link href="/" className="block">
          <Button variant="ghost">Go to Sync</Button>
        </Link>
      </div>
    </Screen>
  )
}
