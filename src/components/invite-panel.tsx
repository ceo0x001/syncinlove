'use client'

import { useState, useTransition } from 'react'
import { revokeClaim } from '@/app/actions'
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
  canRevoke,
}: {
  url: string
  partnerFirstName: string | null
  claimed: boolean
  canRevoke: boolean
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
    </div>
  )
}
