'use client'

import { useActionState, useState } from 'react'
import { sendClaimCode, verifyClaimCode } from '@/app/actions'
import { Button, Notice, TextField } from './ui'

/**
 * Attaching an email to an anonymous account.
 *
 * Asked at the moment the email is obviously in service of something the person
 * already wants — the reveal, or keeping a streak — never as a gate in front of
 * it. Skippable, always.
 *
 * The account already exists; this upgrades it in place, so the streak, the
 * answers and the pairing all survive with the same id.
 *
 * Placement matters more than any of this code: if somebody closes the tab
 * without ever attaching an address, and the browser storage holding their
 * anonymous session is lost — which is routine, since most invite links get
 * tapped inside WhatsApp's in-app browser and then reopened in Safari — the
 * account is unreachable. That is why the ask happens right after submitting
 * rather than after the reveal.
 */
export function ClaimEmail({
  reason,
  onDone,
}: {
  reason: string
  onDone?: () => void
}) {
  const [email, setEmail] = useState('')
  const [sendState, sendAction, sending] = useActionState(sendClaimCode, null)
  const [verifyState, verifyAction, verifying] = useActionState(verifyClaimCode, null)

  const sent = Boolean(sendState?.ok)
  const done = Boolean(verifyState?.ok)

  if (done) {
    return (
      <Notice>
        Saved. You can get back in from any browser now — we’ll email you a code.
      </Notice>
    )
  }

  if (!sent) {
    return (
      <form action={sendAction} className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
        <TextField
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          enterKeyHint="send"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          hint={reason}
        />

        {sendState?.error ? <Notice tone="error">{sendState.error}</Notice> : null}

        <Button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send me a code'}
        </Button>

        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Not now
          </Button>
        ) : null}
      </form>
    )
  }

  return (
    <form action={verifyAction} className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      <input type="hidden" name="email" value={email} />

      {/* No fixed length: Supabase's OTP length is a project setting (6-10). */}
      <TextField
        label="Your code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={10}
        enterKeyHint="done"
        required
        autoFocus
        hint={`Sent to ${email}. Check spam if it's slow.`}
      />

      {verifyState?.error ? <Notice tone="error">{verifyState.error}</Notice> : null}

      <Button type="submit" disabled={verifying}>
        {verifying ? 'Checking…' : 'Confirm'}
      </Button>
    </form>
  )
}
