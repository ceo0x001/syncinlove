'use client'

import { useEffect, useState, useTransition } from 'react'
import type { ActionResult } from '@/app/actions'
import { Button, Notice } from './ui'

/**
 * Asking for another code.
 *
 * Without this, a code that never arrives is a dead end: the only way out was
 * "use a different address", which throws away the address that was correct.
 * Auth mail goes missing for ordinary reasons — greylisting, a slow relay, a
 * spam folder — so this is a normal path, not an error path.
 *
 * Two things it has to get right.
 *
 * A cooldown, because the mailer is rate limited. Tapping resend four times in
 * ten seconds earns a 429 and no email at all, which looks exactly like the
 * problem it was meant to solve. So the button goes quiet for a spell and says
 * when it will be back rather than failing silently.
 *
 * And it has to say that the older code is dead. Supabase issues a fresh OTP and
 * retires the previous one, so somebody who resends and then types the code from
 * the first email gets "that code is wrong" while holding a code that was
 * genuinely emailed to them. That is a maddening thing to debug from the outside,
 * and one sentence prevents it.
 */

const WAIT_SECONDS = 45

export function ResendCode({
  email,
  send,
  disabled = false,
}: {
  email: string
  /** sendClaimCode or sendSignInCode — same shape, different flow. */
  send: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>
  disabled?: boolean
}) {
  const [left, setLeft] = useState(WAIT_SECONDS)
  const [sentAgain, setSentAgain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const waiting = left > 0

  // One interval for the whole countdown: created when it starts running and
  // cleared when it stops, rather than torn down and rebuilt every second.
  useEffect(() => {
    if (!waiting) return
    const id = window.setInterval(() => {
      setLeft((n) => Math.max(0, n - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [waiting])

  function resend() {
    setError(null)
    setSentAgain(false)

    startTransition(async () => {
      const data = new FormData()
      data.set('email', email)

      const result = await send(null, data)

      if (result?.error) {
        setError(result.error)
        return
      }

      setSentAgain(true)
      setLeft(WAIT_SECONDS)
    })
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
      {sentAgain ? (
        <Notice>
          A new code is on its way. Use the newest email — the code in the
          earlier one has stopped working.
        </Notice>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {waiting ? (
        <p className="t-small text-center text-ink-faint">
          Didn&rsquo;t arrive? You can ask for another in {left}s. Check spam
          first — it&rsquo;s usually there.
        </p>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={resend}
          disabled={pending || disabled}
        >
          {pending ? 'Sending…' : 'Send me a new code'}
        </Button>
      )}
    </div>
  )
}
