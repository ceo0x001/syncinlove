'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { joinWithInvite, replaceEmptyPairingAndJoin } from '@/app/actions'
import { haptic } from '@/lib/haptics'
import { Button, Notice } from './ui'

/**
 * Accepting an invite when you already have an account.
 *
 * One button, because one thing is being asked. This screen used to render the
 * signup form here — name, email, age checkbox — to somebody who had already given
 * all three. That was not merely redundant: signup attaches the email before it
 * claims the invite, and attaching an address that already belongs to you fails, so
 * the claim never ran. Every person with an account was structurally unable to
 * accept an invitation, and the app's suggestion was to sign in to the account they
 * were already signed in to.
 *
 * The most common way out of that dead end was the worst one — go to Sync, be shown
 * "invite a partner", and make a pairing of your own, which then blocks the real
 * invitation for good.
 */
export function JoinPairing({
  token,
  inviter,
  meFirstName,
  hasOwnPairing = false,
}: {
  token: string
  inviter: string
  meFirstName: string
  /** They are waiting alone in a pairing of their own. Offers the escape below. */
  hasOwnPairing?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await joinWithInvite(token)
            // Success redirects, so anything returned here is a refusal.
            if (result?.error) {
              setError(result.error)
              haptic('error')
              /*
               * claim_invite trades away a pairing nobody joined, but not one with
               * answers on it. Answer a question while waiting and it refuses — so
               * the escape appears here, at the wall, rather than as an instruction
               * to go and find Settings.
               */
              if (hasOwnPairing) setBlocked(true)
            }
          })
        }
      >
        {pending ? 'Joining…' : `Sync with ${inviter}`}
      </Button>

      {blocked ? (
        <div
          className="stack rounded-[0.875rem] border border-accent/35 bg-accent-wash p-4"
          style={{ ['--stack-gap' as string]: '0.75rem' }}
        >
          <p className="t-small text-ink">
            That&rsquo;s because you already have a pairing of your own, and
            you&rsquo;ve answered on it. Nobody ever joined it, so letting it go costs
            you nothing shared &mdash; only what you answered while waiting.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = await replaceEmptyPairingAndJoin(token)
                if (result?.error) {
                  setError(result.error)
                  haptic('error')
                  return
                }
                haptic('commit')
              })
            }
            className="t-small self-start font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current disabled:opacity-40"
          >
            {pending ? 'Joining…' : `Let mine go and sync with ${inviter}`}
          </button>
        </div>
      ) : null}

      <p className="t-small text-ink-faint">
        Joining as <span className="text-ink-muted">{meFirstName}</span> — the account
        you&rsquo;re signed in to. If that isn&rsquo;t the one you meant,{' '}
        <Link
          href="/signin"
          className="text-ink-muted underline decoration-hairline underline-offset-4"
        >
          sign in as someone else
        </Link>{' '}
        first, because the pairing follows whichever account accepts.
      </p>
    </div>
  )
}
