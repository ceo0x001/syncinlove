'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
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

/**
 * Whether the viewer welcomes movement.
 *
 * `useSyncExternalStore` rather than an effect that calls setState — this is exactly
 * what the hook is for, and it buys something an effect would not: the media query
 * is subscribed, so somebody toggling reduced motion in their OS settings while the
 * page is open sees the card stop being pressable rather than keeping a control that
 * now lies.
 *
 * The server snapshot is `false`: no animation is rendered server-side, so the first
 * paint never promises motion it might not be allowed to deliver.
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
  /*
    Which burst these pieces belong to.
    
    Part of every piece's React key, and that is not cosmetic: with `key={i}` React
    reuses the same DOM nodes on a re-fire, the CSS animation is never re-applied,
    and tapping does nothing visible. Changing the key forces a remount, which is
    what restarts the fall.
  */
  const [burst, setBurst] = useState(0)
  /*
    Used for two decisions: whether the burst fires on open, and whether the card is
    a button at all. A tappable card that cannot animate is a dead control, and a dead
    control is worse than no control.
  */
  const mayAnimate = useSyncExternalStore(subscribeMotion, motionSnapshot, () => false)
  /*
    Whether the tap hint has served its purpose.
    
    Session state rather than localStorage, and that is deliberate rather than lazy.
    On a reload the automatic burst will NOT fire again — it is once per day — so the
    hint reappearing is the useful behaviour: it tells somebody the confetti is still
    available when nothing else on the screen would. Remembering the tap forever would
    silence the one prompt that still has something to say.
  */
  const [hinted, setHinted] = useState(false)

  const fire = useCallback(() => {
    setBurst((n) => n + 1)
    setPieces(makePieces(38))
    haptic('reveal')
  }, [])

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

    if (!mayAnimate) return

    /*
     * Next frame, not this one.
     *
     * Partly the lint rule — a synchronous setState in an effect body is a render
     * immediately followed by another. Mostly because it looks better: the card
     * paints, and the burst starts against a card that is already there rather than
     * arriving in the same frame as its own background.
     */
    const frame = window.requestAnimationFrame(fire)
    return () => window.cancelAnimationFrame(frame)
  }, [occasion.id, today, fire, mayAnimate])

  /*
    Clear the DOM once the longest piece has landed.
    
    Keyed on `burst`, so a tap mid-fall restarts this rather than letting the
    previous timeout cut the new burst short — the effect's cleanup cancels the old
    timer on every re-fire. Tapping repeatedly therefore keeps at most 38 nodes
    alive, however fast somebody presses it.
  */
  useEffect(() => {
    if (pieces.length === 0) return
    const timer = window.setTimeout(() => setPieces([]), 5200)
    return () => window.clearTimeout(timer)
  }, [burst, pieces.length])

  return (
    <>
      {pieces.length > 0 ? (
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
      ) : null}

      {/*
        A button only where it can do something.

        Under reduced motion this stays a plain div: the card's whole job as a control
        is to throw confetti, and offering a press that is then suppressed is a
        control that lies. The message and the bear are unchanged either way.

        `type="button"` because there is no form here and the default would be
        submit. `aria-label` rather than relying on the headline, since "Happy
        Girlfriend's Day." describes the banner and not what pressing it does.
      */}
      {mayAnimate ? (
        <button
          type="button"
          onClick={() => {
            setHinted(true)
            fire()
          }}
          aria-label={`${occasion.headline} Tap for more confetti.`}
          className="occasion-card press flex w-full items-center gap-3.5 text-left"
        >
          <Content occasion={occasion} />
        </button>
      ) : (
        <div className="occasion-card flex items-center gap-3.5">
          <Content occasion={occasion} />
        </div>
      )}

      {/*
        The hint, and only while it has something to say.

        Below the card rather than beside it. The same constraint that moved the "How
        Sync works" arrow applies here — at 375px a full-width card leaves no
        horizontal room for anything alongside it — and pointing up at a thing
        directly above is unambiguous.

        Gone the moment they tap: it exists to teach one gesture, and a prompt that
        outlives the lesson is clutter on a card somebody has to look past to reach
        the day's question.
      */}
      {mayAnimate && !hinted ? (
        <p className="occasion-hint t-small flex items-center gap-1.5 text-ink-faint">
          <TapArrow />
          Tap the card for more confetti
        </p>
      ) : null}
    </>
  )
}

/**
 * Points up at the card above it.
 *
 * Hand-drawn rather than a glyph, matching the arrow on the signup page. The kink in
 * the tail is what stops it reading as chrome — and chrome is precisely what the eye
 * has learned to skip, which would defeat a hint.
 */
function TapArrow() {
  return (
    <svg
      viewBox="0 0 28 26"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="occasion-arrow h-6 w-6 shrink-0 text-accent"
      aria-hidden
    >
      {/*
        Tail sweeps up and left from the text toward the card above.

        Redrawn once. The first attempt put the head at the far end of a long looping
        tail and at 20px the barbs were unreadable — it looked like a hook, and an
        arrow nobody can tell the direction of is decoration. Shorter tail, bigger
        box, and the barbs sized off the tail's actual heading.
      */}
      <path d="M23 23c-3.6-1.4-6.6-3.6-8.6-6.4C12.2 13.6 10.8 10.2 10 6.4" />
      {/* Apex at (10, 5.6), barbs swept back down — an unambiguous upward point. */}
      <path d="M14 10.6 10 5.6 6.2 10.9" />
    </svg>
  )
}

/** Shared so the pressable and plain versions cannot drift apart. */
function Content({ occasion }: { occasion: Occasion }) {
  return (
    <>
      <Teddy />
      <div className="min-w-0">
        <p className="t-title text-ink">{occasion.headline}</p>
        <p className="t-small mt-0.5 text-ink-muted">{occasion.note}</p>
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
