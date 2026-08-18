'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/**
 * A burst of confetti, and the rules that come with it.
 *
 * Extracted from the occasion banner so a second thing worth celebrating — crossing a
 * rung on the tender ladder — does not need a second copy of the reduced-motion
 * handling, the re-fire keys and the cleanup. Those were all learned the hard way once;
 * learning them again in a duplicate is how one of the copies ends up wrong.
 *
 * What the caller decides: when to fire. What this decides: whether it may, and how it
 * behaves once it does.
 *
 * ── Reduced motion gets the message, not the movement ───────────────────
 *
 * Somebody who asked for less movement gets no pieces at all. Honouring the preference
 * means removing the animation, not shortening it — a 1ms burst is a flicker, which is
 * worse than none. `mayAnimate` is exposed so a caller can also drop a control that
 * would otherwise be a dead button.
 *
 * ── Why the pieces are generated after mount ─────────────────────────────
 *
 * Their positions are random, and random values in a server render disagree with the
 * client's on hydration. So the array starts empty and fills on request, which also
 * means the server sends no decoration at all.
 */

const REDUCE = '(prefers-reduced-motion: reduce)'

function subscribeMotion(onChange: () => void): () => void {
  const mql = window.matchMedia(REDUCE)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function motionSnapshot(): boolean {
  return !window.matchMedia(REDUCE).matches
}

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

const HUES = ['var(--accent)', 'var(--accent-2)', 'var(--accent-3)', 'var(--accent)']

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

export interface ConfettiHandle {
  /** The rendered pieces, or nothing. Put this anywhere in the tree. */
  view: React.ReactNode
  /** Throw a fresh burst. A no-op under reduced motion. */
  fire: () => void
  /** Whether movement is welcome. Callers use it to hide controls that would be dead. */
  mayAnimate: boolean
}

export function useConfetti(count = 38): ConfettiHandle {
  const [pieces, setPieces] = useState<Piece[]>([])
  /*
    Which burst these pieces belong to.

    Part of every piece's React key, and that is not cosmetic: with `key={i}` React
    reuses the same DOM nodes on a re-fire, the CSS animation is never re-applied, and
    firing again does nothing visible. Changing the key forces a remount, which is what
    restarts the fall.
  */
  const [burst, setBurst] = useState(0)

  const mayAnimate = useSyncExternalStore(subscribeMotion, motionSnapshot, () => false)

  const fire = useCallback(() => {
    if (!mayAnimate) return
    setBurst((n) => n + 1)
    setPieces(makePieces(count))
  }, [mayAnimate, count])

  /*
    Clear the DOM once the longest piece has landed.

    Keyed on `burst`, so firing again mid-fall restarts this rather than letting the
    previous timeout cut the new burst short — the cleanup cancels the old timer every
    time. Firing repeatedly therefore keeps at most `count` nodes alive, however fast.
  */
  useEffect(() => {
    if (pieces.length === 0) return
    const timer = window.setTimeout(() => setPieces([]), 5200)
    return () => window.clearTimeout(timer)
  }, [burst, pieces.length])

  const view =
    pieces.length > 0 ? (
      <div className="occasion-confetti" aria-hidden>
        {pieces.map((p, i) => (
          <span
            key={`${burst}-${i}`}
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
    ) : null

  return { view, fire, mayAnimate }
}
