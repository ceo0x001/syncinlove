'use client'

import { useEffect } from 'react'
import { useConfetti } from './confetti'
import { tender } from '@/lib/tender'

/**
 * The day a couple crossed a rung, marked on the reveal where it happened.
 *
 * ── Why this is not a toast ─────────────────────────────────────────────
 *
 * It is attached to the day, not to the session. Come back to that reveal in a year and
 * it still says so, because "the day we became Tender Millionaires" is a thing a couple
 * should be able to go and look at — the same reason the reveal keeps its own score
 * rather than only ever showing today's.
 *
 * That is also why the marks are read per day rather than from tender_standing(), which
 * returns only the highest rung: once a couple passes five million, standing stops
 * mentioning the million, and the reveal where they crossed it would quietly lose its
 * marker.
 *
 * ── Once per day, not once per load ─────────────────────────────────────
 *
 * The confetti fires when the reveal reaches this card and not again on a revisit. A
 * burst every time somebody scrolls back through their history stops being a
 * celebration by the third one, and the card still says what happened without it.
 */

export interface Mark {
  threshold: number
  label: string
  joint: boolean
}

const MILLION = 1000000

export function MilestoneBanner({
  marks,
  theirName,
  dayIndex,
  open,
}: {
  marks: Mark[]
  theirName: string
  /** Part of the seen-key, so the flag belongs to this day rather than to the app. */
  dayIndex: number
  /** The reveal's choreography has reached this card. */
  open: boolean
}) {
  const { view, fire, mayAnimate } = useConfetti(46)

  // The biggest thing that happened. Crossing two rungs in one day is possible with a
  // large streak bonus, and two celebrations stacked reads as a bug rather than a bigger
  // achievement.
  const top = marks.reduce<Mark | null>(
    (best, m) => (!best || m.threshold > best.threshold ? m : best),
    null,
  )

  useEffect(() => {
    if (!open || !top || !mayAnimate) return

    /*
      The motion check comes FIRST, before the seen-key is written, and the order is
      load-bearing. `mayAnimate` is false on the hydration render — that is the server
      snapshot useSyncExternalStore must use to match the server's markup — so the effect
      runs once with false and again with the real value. Writing the key on that first
      pass would claim the day and leave the second pass finding it already spent, which
      is exactly how the occasion confetti shipped broken for a day.
    */
    const key = `sync.mark.${dayIndex}.${top.threshold}`
    let seen = false
    try {
      seen = window.localStorage.getItem(key) === 'yes'
    } catch {
      // Safari in private mode throws. Treat it as unseen: one extra burst is a much
      // smaller failure than swallowing the moment this exists for.
    }
    if (seen) return

    try {
      window.localStorage.setItem(key, 'yes')
    } catch {
      /* Nothing to do; it fires again next load, which is survivable. */
    }

    const frame = window.requestAnimationFrame(fire)
    return () => window.cancelAnimationFrame(frame)
  }, [open, top, mayAnimate, dayIndex, fire])

  if (!top) return null

  const headline =
    top.threshold === MILLION
      ? top.joint
        ? `You and ${theirName} became Tender Millionaires.`
        : 'You became a Tender Millionaire.'
      : top.joint
        ? `You and ${theirName} passed ${top.label.toLowerCase()}.`
        : `You passed ${top.label.toLowerCase()}.`

  return (
    <>
      {view}
      <div className="rounded-[0.75rem] bg-accent-wash px-4 py-3 text-center">
        <p className="t-label mb-1">Today</p>
        <p className="t-title text-ink">{headline}</p>
        <p className="t-small mt-1 text-ink-muted">
          {tender(top.threshold)} earned between you, and none of it spent to get here.
        </p>
      </div>
    </>
  )
}
