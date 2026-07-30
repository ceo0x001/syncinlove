'use client'

import { useState, useTransition } from 'react'
import { declineInvite } from '@/app/actions'
import { haptic } from '@/lib/haptics'
import { Notice } from './ui'

/**
 * "Let them know I can't join."
 *
 * The one thing on this screen that tells the sender anything, and it is a button
 * rather than a side effect of arriving here.
 *
 * That distinction is the whole point. Reporting automatically that somebody could
 * not join — and why — would tell whoever sent the link that the recipient is
 * already in a relationship on Sync. Nobody's relationship status should travel to
 * another person because they tapped a link to see what it was. So the disclosure
 * is the recipient's to make, what it carries is only "can't join right now", and
 * closing the tab remains a complete and consequence-free answer.
 *
 * Confirmed in two steps for the same reason any outgoing message is: it cannot be
 * unsent, and it closes the link.
 */
export function DeclineInvite({ token, inviter }: { token: string; inviter: string }) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <Notice>
        {inviter} will see that you can&rsquo;t join. They weren&rsquo;t told why, and
        that link has stopped working — they can send a new one whenever.
      </Notice>
    )
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="t-small self-start text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
      >
        Let {inviter} know you can&rsquo;t join
      </button>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
      <p className="t-small text-ink">
        {inviter} will be told you can&rsquo;t join right now &mdash; nothing about why,
        and nothing about who you&rsquo;re with. It also closes this link, so
        they&rsquo;ll need to send a fresh one if things change.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await declineInvite(token)
              if (result?.error) {
                setError(result.error)
                haptic('error')
                return
              }
              setDone(true)
              haptic('commit')
            })
          }
          className="t-small font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current disabled:opacity-40"
        >
          {pending ? 'Letting them know…' : `Yes, tell ${inviter}`}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="t-small text-ink-muted underline decoration-hairline underline-offset-4 hover:text-ink"
        >
          Say nothing
        </button>
      </div>
    </div>
  )
}

/** Nothing to press. Offered so "say nothing" is a visible choice, not an absence. */
export function SayNothing() {
  return (
    <p className="t-small text-ink-faint">
      Or just close this. Nothing is sent, nobody is told you looked, and the link
      stays live until it expires on its own.
    </p>
  )
}
