'use client'

import { useEffect, useState } from 'react'
import type { Occasion } from '@/lib/occasions'
import { haptic } from '@/lib/haptics'

/**
 * A day worth marking, marked once.
 *
 * ── Once per day, not once per load ──────────────────────────────────────
 *
 * The confetti fires the first time somebody opens the app on the day and then
 * never again, because a burst on every navigation stops being a celebration by
 * the third one. The seen-flag is keyed by occasion AND pair-local date, so it
 * cannot leak into next year and cannot be "used up" by a stray render.
 *
 * localStorage rather than the database: this is a per-device decoration, and
 * writing a row to remember that somebody saw some confetti is not worth a
 * migration. The cost of being wrong is one extra burst on a second device.
 *
 * ── Reduced motion gets the message, not the movement ───────────────────
 *
 * Somebody who asked for less movement still gets the banner and the teddy. What
 * they do not get is forty things flying across their screen, which is the one part
 * of this that is purely motion. Honouring the preference means removing the
 * animation, not shortening it — a 1ms confetti burst is a flicker, which is worse
 * than none.
 *
 * ── Why the pieces are generated after mount ─────────────────────────────
 *
 * Their positions are random, and random values in a server render disagree with
 * the client's on hydration. So the array starts empty and fills in an effect,
 * which also means the server sends no decoration at all.
 */

interface Piece {
  left: number
  delay: number
  duration: number
  drift: number
  rotate: number
  size: number
  kind: 'heart' | 'dot' | 'ribbon'
  hue: string
}

const HUES = [
  'var(--accent)',
  'var(--accent-2)',
  'var(--accent-3)',
  'var(--accent)',
]

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 420,
    duration: 2600 + Math.random() * 1800,
    // Sideways travel, signed, so the burst spreads rather than raining straight down.
    drift: (Math.random() - 0.5) * 160,
    rotate: (Math.random() - 0.5) * 720,
    size: 6 + Math.random() * 7,
    kind: (['heart', 'dot', 'ribbon'] as const)[Math.floor(Math.random() * 3)],
    hue: HUES[Math.floor(Math.random() * HUES.length)],
  }))
}

export function OccasionBanner({
  occasion,
  today,
}: {
  occasion: Occasion
  /** Pair-local `YYYY-MM-DD`. Part of the seen-key so the flag cannot outlive the day. */
  today: string
}) {
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    const key = `sync.occasion.${occasion.id}.${today}`

    let seen = false
    try {
      seen = window.localStorage.getItem(key) === 'yes'
    } catch {
      // Safari in private mode throws. Treat it as unseen: an extra burst is a much
      // smaller failure than swallowing the one moment this exists for.
    }
    if (seen) return

    try {
      window.localStorage.setItem(key, 'yes')
    } catch {
      /* Nothing to do; it will fire again next load, which is survivable. */
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    /*
     * Next frame, not this one.
     *
     * Partly the lint rule — a synchronous setState in an effect body is a render
     * immediately followed by another. Mostly because it looks better: the card
     * paints, and the burst starts against a card that is already there rather than
     * arriving in the same frame as its own background.
     */
    let timer = 0
    const frame = window.requestAnimationFrame(() => {
      setPieces(makePieces(38))
      haptic('reveal')

      // Clear the DOM once the longest piece has landed, so a few dozen absolutely
      // positioned nodes are not left animating behind everything for the session.
      timer = window.setTimeout(() => setPieces([]), 5200)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      if (timer) window.clearTimeout(timer)
    }
  }, [occasion.id, today])

  return (
    <>
      {pieces.length > 0 ? (
        <div className="occasion-confetti" aria-hidden>
          {pieces.map((p, i) => (
            <span
              key={i}
              className={`occasion-piece occasion-${p.kind}`}
              style={{
                left: `${p.left}%`,
                background: p.kind === 'heart' ? 'transparent' : p.hue,
                color: p.hue,
                width: `${p.size}px`,
                height: `${p.kind === 'ribbon' ? p.size * 2.2 : p.size}px`,
                animationDelay: `${p.delay}ms`,
                animationDuration: `${p.duration}ms`,
                ['--drift' as string]: `${p.drift}px`,
                ['--spin' as string]: `${p.rotate}deg`,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="occasion-card flex items-center gap-3.5">
        <Teddy />
        <div className="min-w-0">
          <p className="t-title text-ink">{occasion.headline}</p>
          <p className="t-small mt-0.5 text-ink-muted">{occasion.note}</p>
        </div>
      </div>
    </>
  )
}

/**
 * The teddy.
 *
 * Drawn rather than imported, for the same reason the rest of this app's marks are:
 * it inherits `currentColor`, so it is correct in both themes without a second
 * asset, and it stays sharp on every display. A PNG would need two exports, an
 * `@2x`, and a decision about what happens in dark mode.
 *
 * Deliberately small and beside the words rather than a hero illustration. It marks
 * the day; the day's question is still the thing on this screen that matters.
 */
function Teddy() {
  return (
    <svg
      viewBox="0 0 44 44"
      className="size-11 shrink-0"
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Ears, behind the head so the fill overlaps cleanly. */}
      <circle cx="12" cy="12.5" r="6" className="fill-[var(--teddy-fur)]" />
      <circle cx="32" cy="12.5" r="6" className="fill-[var(--teddy-fur)]" />
      <circle cx="12" cy="12.5" r="2.8" className="fill-[var(--teddy-inner)]" />
      <circle cx="32" cy="12.5" r="2.8" className="fill-[var(--teddy-inner)]" />

      {/* Head. */}
      <circle cx="22" cy="21" r="13" className="fill-[var(--teddy-fur)]" />

      {/* Muzzle. */}
      <ellipse cx="22" cy="26" rx="7" ry="5.5" className="fill-[var(--teddy-inner)]" />
      <path d="M22 24v2.4" stroke="var(--teddy-line)" strokeWidth="1.5" />
      {/* The mouth: two small curves, which is the whole difference between a bear
          and a bear that looks pleased about something. */}
      <path
        d="M19.4 27.6a2.6 2.6 0 0 0 2.6 1.5 2.6 2.6 0 0 0 2.6-1.5"
        stroke="var(--teddy-line)"
        strokeWidth="1.5"
      />
      <ellipse cx="22" cy="23.4" rx="1.7" ry="1.25" fill="var(--teddy-line)" />

      {/* Eyes. */}
      <circle cx="16.6" cy="18.6" r="1.5" fill="var(--teddy-line)" />
      <circle cx="27.4" cy="18.6" r="1.5" fill="var(--teddy-line)" />

      {/* A heart, held. The one bit of brand colour on it. */}
      <path
        d="M35.5 30.2c1.9-1.7 4.6-.5 4.6 1.6 0 1.9-2.3 3.6-4.6 5.2-2.3-1.6-4.6-3.3-4.6-5.2 0-2.1 2.7-3.3 4.6-1.6z"
        className="fill-[var(--accent)]"
      />
    </svg>
  )
}
