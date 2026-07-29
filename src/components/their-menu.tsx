'use client'

import { useState, useTransition } from 'react'
import { buyMenuItem } from '@/app/actions'
import type { Economy } from '@/lib/session'
import { Notice } from './ui'

/**
 * Spending on their menu.
 *
 * The line at the bottom is the most important copy in the app. The moment
 * tender starts reading as an obligation — "I paid, so you owe me" — this stops
 * being a game about attention and becomes a pressure script with a currency
 * attached. It stays on screen permanently rather than appearing in an
 * onboarding tip nobody rereads.
 */
export function TheirMenu({
  economy,
  partnerFirstName,
}: {
  economy: Economy
  partnerFirstName: string
}) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const { theirMenu, mine, canSpend, needsEmail, needsMoreItems } = economy

  if (theirMenu.length === 0) {
    return (
      <Notice>
        {partnerFirstName} hasn’t written a menu yet. It usually turns up once
        they’re holding tender with nothing to spend it on.
      </Notice>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      {!canSpend ? (
        <Notice>
          {needsEmail
            ? 'Add your email before spending — it’s the one thing that makes this account recoverable.'
            : `Write ${needsMoreItems} more thing${needsMoreItems === 1 ? '' : 's'} on your own menu first. It only works if it goes both ways.`}
        </Notice>
      ) : null}

      {theirMenu.map((item) => {
        const affordable = mine.balance >= item.price
        const busy = pendingId === item.id

        return (
          <div
            key={item.id}
            className="flex items-start justify-between gap-4 rounded-[0.75rem] border border-hairline bg-paper-raised p-4"
          >
            <div className="min-w-0">
              <p className="t-title break-words text-ink">{item.title}</p>
              <p className="t-small mt-1 tabular text-ink-muted">T{item.price}</p>
              {item.lastPriceChange ? (
                <p className="t-small mt-1 tabular text-ink-faint">
                  was T{item.lastPriceChange.from}
                </p>
              ) : null}
              {!affordable ? (
                <p className="t-small mt-1 tabular text-ink-faint">
                  T{item.price - mine.balance} short
                </p>
              ) : null}
            </div>

            <button
              type="button"
              disabled={!canSpend || !affordable || busy}
              onClick={() => {
                setError(null)
                setPendingId(item.id)
                startTransition(async () => {
                  const result = await buyMenuItem(item.id)
                  if (result?.error) setError(result.error)
                  setPendingId(null)
                })
              }}
              className={
                'shrink-0 rounded-[0.5rem] px-4 py-2.5 text-[0.875rem] font-medium transition-all ' +
                'disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] ' +
                (canSpend && affordable
                  ? 'text-accent-ink hover:brightness-[1.04]'
                  : 'bg-paper-sunken text-ink-muted')
              }
              style={
                canSpend && affordable
                  ? { backgroundImage: 'var(--brand-gradient)' }
                  : undefined
              }
            >
              {busy ? 'Asking…' : 'Ask'}
            </button>
          </div>
        )
      })}

      {error ? <Notice tone="error">{error}</Notice> : null}

      <p className="t-small text-ink-faint">
        Asking is asking. {partnerFirstName} can say no and the tender comes
        straight back — tender is a nudge, never a contract.
      </p>
    </div>
  )
}
