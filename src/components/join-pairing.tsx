'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { joinWithInvite } from '@/app/actions'
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
}: {
  token: string
  inviter: string
  meFirstName: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
            }
          })
        }
      >
        {pending ? 'Joining…' : `Sync with ${inviter}`}
      </Button>

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
