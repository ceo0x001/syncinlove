'use client'

import { useActionState, useEffect, useState } from 'react'
import { sendSignInCode, verifySignInCode } from '@/app/actions'
import { ResendCode } from './resend-code'
import { Button, Notice, TextField } from './ui'

/**
 * Signing in with an emailed code.
 *
 * The same shape as confirming an address, and for the same reason: a link tapped
 * from a mail app frequently opens in a different browser than the one waiting for
 * it, which is precisely how somebody ends up unable to reach their own account. A
 * typed code stays in one browser.
 *
 * The outstanding-code state survives a reload, because the normal path on a phone
 * is tap send, switch to the mail app, come back — and a backgrounded tab is
 * routinely reloaded on return.
 */

const PENDING_KEY = 'sync.pendingSignInEmail'

/**
 * "Use a different address" has to remount rather than flip a flag.
 *
 * useActionState keeps its result until the component unmounts, so once a send
 * succeeded the code step could never be left — the button was dead. Changing the
 * key resets the action state along with everything else.
 */
export function SignInForm() {
  const [attempt, setAttempt] = useState(0)
  return <SignInAttempt key={attempt} onRestart={() => setAttempt((n) => n + 1)} />
}

function SignInAttempt({ onRestart }: { onRestart: () => void }) {
  const [email, setEmail] = useState('')
  const [restored, setRestored] = useState(false)
  const [sendState, sendAction, sending] = useActionState(sendSignInCode, null)
  const [verifyState, verifyAction, verifying] = useActionState(verifySignInCode, null)

  const justSent = Boolean(sendState?.ok)
  const sent = justSent || restored

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

  useEffect(() => {
    if (justSent && email) sessionStorage.setItem(PENDING_KEY, email)
  }, [justSent, email])

  function startOver() {
    sessionStorage.removeItem(PENDING_KEY)
    onRestart()
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
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {sendState?.error ? <Notice tone="error">{sendState.error}</Notice> : null}

        <Button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Send me a code'}
        </Button>
      </form>
    )
  }

  return (
    <form action={verifyAction} className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      <input type="hidden" name="email" value={email} />

      {/* Worded so it says the same thing whether or not the address has an
          account — otherwise this page would tell strangers who has one. */}
      <Notice>
        If {email} has an account, a code is on its way.
      </Notice>

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
        hint="Check spam if it's slow."
      />

      {verifyState?.error ? <Notice tone="error">{verifyState.error}</Notice> : null}

      <Button type="submit" disabled={verifying}>
        {verifying ? 'Signing you in…' : 'Sign in'}
      </Button>

      {/* Same dead end as the claim flow had: without this, a code that never
          arrives leaves nothing to do but abandon a correct address. */}
      <ResendCode email={email} send={sendSignInCode} disabled={verifying} />

      <Button type="button" variant="ghost" onClick={startOver} disabled={verifying}>
        Use a different address
      </Button>
    </form>
  )
}
