'use client'

import { useActionState, useEffect, useState } from 'react'
import { sendClaimCode, verifyClaimCode } from '@/app/actions'
import { Button, Notice, TextField } from './ui'

/**
 * Confirming the address, which is what makes an account recoverable.
 *
 * The address itself is now collected on the signup form, so this usually opens
 * straight at the code step. It stays on screen until confirmed rather than being
 * a card you can wave away — a dismissible ask is exactly what somebody skipped
 * before losing an account outright.
 *
 * The account already exists; confirming upgrades it in place, so the streak, the
 * answers and the pairing all survive with the same id.
 *
 * Why it matters this much: an unconfirmed account cannot be proved to be yours.
 * Lose the browser storage holding the session — routine, since most invite links
 * get tapped inside WhatsApp and reopened in Safari — and it is gone for good,
 * with no recovery path that does not involve trusting somebody's word.
 */

/** Survives a reload; cleared on success. Session-scoped, never persisted. */
const PENDING_KEY = 'sync.pendingClaimEmail'

/**
 * "Use a different address" has to remount rather than flip a flag.
 *
 * useActionState holds its result until unmount, so once a send succeeded the code
 * step could never be left and the button did nothing. Changing the key resets it.
 */
export function ClaimEmail(props: {
  reason: string
  onDone?: () => void
  pendingEmail?: string | null
}) {
  const [attempt, setAttempt] = useState(0)
  return (
    <ClaimAttempt key={attempt} {...props} onRestart={() => setAttempt((n) => n + 1)} />
  )
}

function ClaimAttempt({
  reason,
  onDone,
  pendingEmail,
  onRestart,
}: {
  reason: string
  onDone?: () => void
  /**
   * An address already attached at signup and awaiting its code. When present the
   * form opens straight at the code step — asking for the address again would be
   * asking for something already given.
   */
  pendingEmail?: string | null
  onRestart: () => void
}) {
  const [email, setEmail] = useState(pendingEmail ?? '')
  const [restored, setRestored] = useState(false)
  const [sendState, sendAction, sending] = useActionState(sendClaimCode, null)
  const [verifyState, verifyAction, verifying] = useActionState(verifyClaimCode, null)

  const justSent = Boolean(sendState?.ok)
  const sent = justSent || restored || Boolean(pendingEmail)
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
    onRestart()
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
