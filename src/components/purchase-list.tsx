'use client'

import { useState, useTransition } from 'react'
import { declinePurchase, markFulfilled } from '@/app/actions'
import type { Purchase } from '@/lib/session'
import { Notice } from './ui'

/**
 * Outstanding and settled requests.
 *
 * Deliberately absent: any notion of overdue. No timers, no ageing, no red after
 * three days. A countdown on somebody's obligation converts a gift into a debt,
 * which is exactly what this mechanic must never become — so an unfulfilled
 * request simply sits there, visible, indefinitely.
 *
 * Visibility is the whole enforcement mechanism. It's enough between two people
 * who like each other, and anything stronger would be worse than nothing.
 */
export function PurchaseList({
  purchases,
  partnerFirstName,
}: {
  purchases: Purchase[]
  partnerFirstName: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (purchases.length === 0) return null

  const open = purchases.filter((p) => p.status === 'requested')
  const settled = purchases.filter((p) => p.status !== 'requested').slice(0, 8)

  function act(id: string, fn: (id: string) => Promise<{ error?: string }>) {
    setError(null)
    setBusy(id)
    startTransition(async () => {
      const result = await fn(id)
      if (result?.error) setError(result.error)
      setBusy(null)
    })
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
      {open.length > 0 ? (
        <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
          <p className="t-label">Outstanding</p>

          {open.map((p) => (
            <div
              key={p.id}
              className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4"
            >
              <p className="t-title break-words text-ink">{p.title}</p>
              <p className="t-small mt-1 text-ink-muted">
                <span className="tabular">T{p.price}</span>
                {' · '}
                {p.iBought ? `you asked ${partnerFirstName}` : `${partnerFirstName} asked you`}
              </p>

              <div className="mt-3 flex flex-wrap gap-4 border-t border-hairline pt-3">
                {p.iBought ? (
                  <>
                    {/* Only the buyer closes it. A seller who could mark their
                        own work done leaves the person who paid with nothing. */}
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => act(p.id, markFulfilled)}
                      className="t-small font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current disabled:opacity-40"
                    >
                      They did it
                    </button>
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => act(p.id, declinePurchase)}
                      className="t-small text-ink-faint underline decoration-hairline underline-offset-4 hover:text-ink-muted disabled:opacity-40"
                    >
                      Never mind — refund me
                    </button>
                  </>
                ) : (
                  <>
                    <p className="t-small text-ink-muted">
                      Yours to honour whenever. No clock on it.
                    </p>
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => act(p.id, declinePurchase)}
                      className="t-small text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink disabled:opacity-40"
                    >
                      Say no, refund them
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {settled.length > 0 ? (
        <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
          <p className="t-label">Already settled</p>
          {settled.map((p) => (
            <div key={p.id} className="flex items-baseline justify-between gap-3 py-1">
              <span className="t-small min-w-0 truncate text-ink-muted">{p.title}</span>
              <span className="t-small shrink-0 tabular text-ink-faint">
                T{p.price} ·{' '}
                {p.status === 'fulfilled' ? 'done' : 'refunded'}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
