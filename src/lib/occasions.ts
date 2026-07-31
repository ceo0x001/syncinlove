import { localParts } from '@/lib/sync/day'

/**
 * Days worth marking.
 *
 * ── On the clock this uses ────────────────────────────────────────────────
 *
 * The PAIR's timezone, not the server's and not the viewer's. Everything dated in
 * this app already works that way — the question window, the letter policy, the
 * freeze allowance — and an occasion that arrived at a different moment than the
 * day's question would be the one dated thing in the product on its own calendar.
 *
 * It also means a couple sees it together. Two people eight hours apart share one
 * clock here, so they get the confetti on the same day rather than one of them
 * seeing it while the other has not reached it yet.
 *
 * ── On recurring rather than expiring ────────────────────────────────────
 *
 * Matched on month and day, so this fires every 1 August and needs nobody to
 * remember to delete it. A hard-coded `2026-08-01` would have been marginally
 * simpler and would have left a dead branch in the codebase forever, which is how
 * a seasonal feature becomes a puzzle for whoever reads it in November.
 */

export interface Occasion {
  /** Stable, and used in the localStorage key that stops it firing twice. */
  id: string
  /** `MM-DD`. Recurs annually. */
  on: string
  /** Shown on the dashboard. Short — it sits above the day's question, not instead of it. */
  headline: string
  note: string
}

const OCCASIONS: readonly Occasion[] = [
  {
    id: 'girlfriend-day',
    on: '08-01',
    headline: 'Happy Girlfriend’s Day.',
    note: 'Today’s question counts double as an excuse. Go and guess her properly.',
  },
]

/**
 * Whichever occasion is today for this pairing, if any.
 *
 * Takes the timezone rather than reading a global, so the caller has to have a pair
 * in hand — which is the only context where "the pair's today" means anything.
 */
export function occasionToday(timeZone: string, at: Date = new Date()): Occasion | null {
  const monthDay = localParts(at, timeZone).date.slice(5) // 'YYYY-MM-DD' -> 'MM-DD'
  return OCCASIONS.find((o) => o.on === monthDay) ?? null
}
