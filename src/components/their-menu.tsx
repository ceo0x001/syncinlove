'use client'

import { useState, useTransition } from 'react'
import { buyMenuItem } from '@/app/actions'
import type { Economy } from '@/lib/session'
import { tender } from '@/lib/tender'
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

  const { theirMenu, mine, canSpend, needsEmail, needsMoreItems, held } = economy

  if (theirMenu.length === 0) {
    return (
      <Notice>
        {partnerFirstName} hasn’t written a menu yet. It usually turns up once
        they’re holding tender with nothing to spend it on.
      </Notice>
    )
  }

  return (
    <div className="stack stagger" style={{ ['--stack-gap' as string]: '1rem' }}>
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
            // Pink edge and the sunken surface: theirs, the one you spend on.
            // Your own menu is coral on white. The two directions of the economy
            // looked identical before, which made it easy to misread which side
            // of a price you were on.
            className="candy-card lift flex items-start justify-between gap-4 candy-theirs"
          >
            <div className="min-w-0">
              <p className="t-title break-words text-ink">{item.title}</p>
              <p className="t-small mt-1 tabular text-ink-muted">{tender(item.price)}</p>
              {item.lastPriceChange ? (
                <p className="t-small mt-1 tabular text-ink-faint">
                  was {tender(item.lastPriceChange.from)}
                </p>
              ) : null}
              {!affordable ? (
                <p className="t-small mt-1 tabular text-ink-faint">
                  {tender(item.price - mine.balance)} short
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
                'candy shrink-0 text-[0.875rem] disabled:pointer-events-none ' +
                // Unaffordable stays a key, just an inert one — the shape is what
                // says "this is the thing you press", and swapping it for a flat
                // label made an item you cannot afford look like an item you
                // cannot ask for at all.
                (canSpend && affordable ? '' : 'candy-quiet')
              }
            >
              {busy ? 'Asking…' : 'Ask'}
            </button>
          </div>
        )
      })}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {held > 0 ? (
        <p className="t-small text-ink-muted">
          <span className="tabular">{tender(held)}</span> is held against requests
          you&rsquo;ve made. It reaches {partnerFirstName} when you confirm they did
          it, and comes back to you if they say no.
        </p>
      ) : null}

      <p className="t-small text-ink-faint">
        Asking is asking. {partnerFirstName} can say no and the tender comes
        straight back — tender is a nudge, never a contract.
      </p>
    </div>
  )
}
