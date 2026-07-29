'use client'

import { useActionState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { startSession } from '@/app/actions'
import { Button, Checkbox, Notice, TextField } from './ui'

/**
 * First contact.
 *
 * Name, email, and one checkbox. No password.
 *
 * The email was originally deferred until after the first reveal, on the
 * reasoning that nobody should type an address before seeing what the app does.
 * That was wrong, and a real person paid for it: an invited partner answered,
 * skipped the email card, lost her browser session, and her account became
 * permanently unreachable — there is no way to prove you are an anonymous user.
 *
 * So the address is collected here. It costs a field before value and will lose
 * some invitees, which is a real price. An account that cannot be recovered is
 * worse.
 *
 * Typing it does not gate anything: the code is sent immediately and can be
 * entered whenever, so somebody can still answer within seconds of tapping a
 * link. What it buys is that the account is recoverable from minute one.
 *
 * The name is not a credential, it's what the app calls you. A pet name or a
 * pseudonym is a perfectly good answer, and it's editable afterwards.
 */
export function EntryForm({
  inviteToken,
  inviterFirstName,
}: {
  inviteToken?: string
  inviterFirstName?: string
}) {
  const [state, formAction, pending] = useActionState(startSession, null)
  const timeZoneRef = useRef<HTMLInputElement>(null)

  // The pair adopts whichever zone the person who created it is in — the server
  // only ever sees a header-derived guess, so this has to be read client-side.
  //
  // Written straight to the DOM rather than held in state: it's a one-time
  // platform read with no bearing on rendering, both sides render the same
  // fallback so there's no hydration mismatch, and the action re-validates the
  // value anyway.
  useEffect(() => {
    if (!timeZoneRef.current) return
    try {
      timeZoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      timeZoneRef.current.value = 'UTC'
    }
  }, [])

  const joining = Boolean(inviteToken)

  return (
    <form action={formAction} className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
      <input ref={timeZoneRef} type="hidden" name="timeZone" defaultValue="UTC" />
      {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}

      <TextField
        label={joining && inviterFirstName ? `What does ${inviterFirstName} call you?` : 'First name'}
        name="firstName"
        autoComplete="given-name"
        autoCapitalize="words"
        enterKeyHint="next"
        maxLength={40}
        required
        autoFocus
        placeholder=""
        hint="However you'd like to be known. You can change it whenever."
      />

      <TextField
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        enterKeyHint="done"
        required
        hint="So this account is yours to get back into. We never email anything you've written."
      />

      <Checkbox name="adult" label="I’m 18 or older." />

      {state?.error ? (
        <Notice tone="error">
          {state.error}
          {/* The case that stranded somebody: an address that already has an
              account. Signup cannot reach it, so say where to go. */}
          {state.signIn ? (
            <>
              {' '}
              <Link href="/signin" className="text-ink underline underline-offset-4">
                Sign in
              </Link>
            </>
          ) : null}
        </Notice>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'One moment…' : joining ? 'Start answering' : "See today's question"}
      </Button>
    </form>
  )
}
