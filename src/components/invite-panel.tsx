'use client'

import { useState, useTransition } from 'react'
import { reissueInvite, revokeClaim } from '@/app/actions'
import { Button, Notice } from './ui'

/**
 * The invite link.
 *
 * Stays visible on the home screen until it's claimed, because the inviter will
 * close the tab before they get round to sending it and a link they can't find
 * again is a dead pairing.
 */
export function InvitePanel({
  url,
  partnerFirstName,
  claimed,
  expired,
  canRevoke,
  declined = false,
}: {
  url: string
  partnerFirstName: string | null
  claimed: boolean
  expired: boolean
  canRevoke: boolean
  /**
   * They chose to say they can't join.
   *
   * Carries no reason, and the copy below must not invent one. The recipient
   * pressed a button to send this much and nothing more — see 0018. Guessing out
   * loud ("they're probably already paired") would leak by implication exactly
   * what the design refuses to state.
   */
  declined?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_200)
    } catch {
      setError('Copying failed — select the link and copy it manually.')
    }
  }

  async function share() {
    // Native share sheet where it exists, which on a phone is the whole point.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'Sync',
          text: 'Answer today’s question with me.',
          url,
        })
        return
      } catch {
        // Cancelled, or unavailable. Fall through to copying.
      }
    }
    void copy()
  }

  /**
   * Checked before `claimed`, though the two cannot both be true — decline_invite
   * refuses an already-claimed invite. Ordered this way so that if that ever stops
   * holding, the more specific state wins rather than being silently swallowed.
   */
  if (declined) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <Notice>
          They can&rsquo;t join right now. That&rsquo;s all they said, and the link has
          closed &mdash; you can send a fresh one whenever you like.
        </Notice>
        <Button
          variant="quiet"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await reissueInvite()
              if (result?.error) setError(result.error)
            })
          }
        >
          {pending ? 'Making a new link…' : 'Make a new link'}
        </Button>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    )
  }

  if (claimed) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <Notice>
          {partnerFirstName ? `${partnerFirstName} is in.` : 'Somebody has joined.'} If that
          isn’t who you meant, you can undo it{canRevoke ? '' : ' — though that window has closed'}.
        </Notice>

        {canRevoke ? (
          <>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeClaim()
                  if (result?.error) setError(result.error)
                })
              }
            >
              {pending ? 'Undoing…' : 'That’s not who I meant — undo'}
            </Button>
            {error ? <Notice tone="error">{error}</Notice> : null}
          </>
        ) : null}
      </div>
    )
  }

  /**
   * An expired link is shown as expired rather than shown as a link.
   *
   * The old screen displayed a dead URL identically to a live one, with Send and
   * Copy still inviting you to pass it on. Somebody could send a link that could
   * not possibly work and hear nothing back.
   */
  if (expired) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
        <Notice tone="error">
          This link has expired — they had seven days and nobody joined. Make a
          fresh one and it&rsquo;ll work for another seven.
        </Notice>

        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await reissueInvite()
              if (result?.error) setError(result.error)
            })
          }
        >
          {pending ? 'Making a new link…' : 'Make a new link'}
        </Button>

        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      <div className="rounded-[0.75rem] border border-hairline bg-paper-sunken px-4 py-3.5">
        <p className="t-label mb-1.5">Their link</p>
        <p className="break-all font-mono text-[0.8125rem] leading-relaxed text-ink-muted">
          {url}
        </p>
      </div>

      <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
        <Button onClick={share}>Send the link</Button>
        <Button variant="quiet" onClick={copy}>
          {copied ? 'Copied' : 'Copy instead'}
        </Button>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <p className="t-small text-ink-faint">
        They can start answering straight away — no account, no password. The link
        works once and expires in seven days.
      </p>

      {/* Available before expiry too: a link lost in a chat thread, or sent to
          the wrong person, is the same problem a week early. */}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reissueInvite()
            if (result?.error) setError(result.error)
          })
        }
        className="press t-small self-start text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
      >
        {pending ? 'Making a new link…' : 'Replace this link with a new one'}
      </button>
    </div>
  )
}
