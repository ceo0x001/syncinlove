'use client'

import { useEffect, useState } from 'react'
import { useConfetti } from './confetti'
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
/*
  The confetti itself now lives in ./confetti, shared with the tender milestone banner.

  Extracted rather than copied: the reduced-motion handling, the burst keys that make a
  re-fire actually re-animate, and the cleanup that stops repeated taps piling up nodes
  were each learned the hard way here. A second copy is how one of them ends up wrong.

  What stayed is this component's own rule — once per occasion per pair-local day — and
  the bear.
*/

export function OccasionBanner({
  occasion,
  today,
}: {
  occasion: Occasion
  /** Pair-local `YYYY-MM-DD`. Part of the seen-key so the flag cannot outlive the day. */
  today: string
}) {
  const { view, fire, mayAnimate } = useConfetti(38)
  /*
    Whether the tap hint has served its purpose.
    
    Session state rather than localStorage, and that is deliberate rather than lazy.
    On a reload the automatic burst will NOT fire again — it is once per day — so the
    hint reappearing is the useful behaviour: it tells somebody the confetti is still
    available when nothing else on the screen would. Remembering the tap forever would
    silence the one prompt that still has something to say.
  */
  const [hinted, setHinted] = useState(false)



  useEffect(() => {
    /*
      The motion check comes FIRST, and the order is the whole bug it fixes.

      `mayAnimate` is false on the first client render — that is the server snapshot,
      which useSyncExternalStore has to use during hydration to match the server's
      markup. So this effect runs once with false, then again with the real value.

      When the seen-key was written before this check, that first pass marked the day
      as seen and returned, and the second pass found the flag already set and did
      nothing. The confetti never fired for anybody, while every counter said it had:
      the key was written, no error was thrown, and reduced motion was off.

      Checking motion first means the false pass does nothing at all, and the pass
      that can actually fire is the one that claims the day.
    */
    if (!mayAnimate) return

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


  return (
    <>
      {view}
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
            // Restored deliberately. The haptic used to live inside the local fire
            // callback and extracting the confetti took it with it — but it belongs to
            // the TAP, not to the burst. The automatic one on open never buzzed and
            // should not start now that the two share a hook.
            haptic('reveal')
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
