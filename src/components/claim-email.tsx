'use client'

import { useActionState, useEffect, useState } from 'react'
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

/** Survives a reload; cleared on success. Session-scoped, never persisted. */
const PENDING_KEY = 'sync.pendingClaimEmail'

export function ClaimEmail({
  reason,
  onDone,
}: {
  reason: string
  onDone?: () => void
}) {
  const [email, setEmail] = useState('')
  const [restored, setRestored] = useState(false)
  const [sendState, sendAction, sending] = useActionState(sendClaimCode, null)
  const [verifyState, verifyAction, verifying] = useActionState(verifyClaimCode, null)

  const justSent = Boolean(sendState?.ok)
  const sent = justSent || restored
  const done = Boolean(verifyState?.ok)

  /**
   * Restore a code that's still outstanding.
   *
   * The reason this exists: on a phone the normal path is tap "send", switch to
   * the mail app, come back — and a backgrounded tab is routinely reloaded on
   * return. Without this, the code field disappears and the user is left holding
   * a perfectly valid code with nowhere to type it.
   *
   * Deferred through a timer so nothing is written synchronously from the effect
   * body, and so the server and the client's first paint agree before this
   * changes anything.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const pending = sessionStorage.getItem(PENDING_KEY)
      if (pending) {
        setEmail(pending)
        setRestored(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  // Writing to storage is not state, so this belongs in an effect as-is.
  useEffect(() => {
    if (justSent && email) sessionStorage.setItem(PENDING_KEY, email)
  }, [justSent, email])

  useEffect(() => {
    if (done) sessionStorage.removeItem(PENDING_KEY)
  }, [done])

  function startOver() {
    sessionStorage.removeItem(PENDING_KEY)
    setRestored(false)
    setEmail('')
  }

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
        autoFocus={justSent}
        hint={`Sent to ${email}. Check spam if it's slow.`}
      />

      {verifyState?.error ? <Notice tone="error">{verifyState.error}</Notice> : null}

      <Button type="submit" disabled={verifying}>
        {verifying ? 'Checking…' : 'Confirm'}
      </Button>

      {/* Without this, a wrong address is a dead end. */}
      <Button type="button" variant="ghost" onClick={startOver} disabled={verifying}>
        Use a different address
      </Button>
    </form>
  )
}
