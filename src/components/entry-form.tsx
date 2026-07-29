'use client'

import { useActionState, useEffect, useRef } from 'react'
import { startSession } from '@/app/actions'
import { Button, Checkbox, Notice, TextField } from './ui'

/**
 * First contact.
 *
 * One name field and one checkbox. No email, no password — submitting this is
 * what creates the account, silently, so nobody types an address before they
 * have seen what the app does. The email ask comes later, once the reveal is the
 * thing being offered.
 *
 * The name is not a credential, it's what the app calls you. A pet name or a
 * pseudonym is a perfectly good answer, and it's changeable.
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
        enterKeyHint="done"
        maxLength={40}
        required
        autoFocus
        placeholder=""
        hint="However you'd like to be known. You can change it whenever."
      />

      <Checkbox name="adult" label="I’m 18 or older." />

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'One moment…' : joining ? 'Start answering' : 'Begin'}
      </Button>
    </form>
  )
}
