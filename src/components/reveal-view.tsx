'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { haptic } from '@/lib/haptics'
import { withPartnerName } from '@/lib/questions/bank'
import { MERGE_GAP, closeness, gapSentence } from '@/lib/questions/scale-words'
import type { AnswerPayload, ChoiceFacet, Facet, Question, ScaleFacet } from '@/lib/questions/types'
import { NEUTRAL_MATCH, scoreFacet } from '@/lib/sync/score'
import { tender } from '@/lib/tender'
import { MilestoneBanner, type Mark } from './milestone-banner'
import { ShareCardButton } from './share-card-button'
import { Button, Rule } from './ui'

/**
 * The reveal.
 *
 * This screen is the entire emotional payoff, so it is choreographed rather than
 * rendered. The order matters:
 *
 *   1. The seal is still there for a beat — the same two dots the waiting screen
 *      showed, so this reads as *that* thing opening rather than a new page.
 *   2. It breaks. The score takes its place and resolves upward.
 *   3. Only then, how well each of you read the other.
 *   4. Then the answers themselves, card by card, with each slider's two marks
 *      opening apart from the middle so the gap *becomes* visible instead of
 *      arriving pre-drawn.
 *
 * Everything is CSS transitions driven by one stage counter. No animation
 * library: this ships to phones on uneven connections, and 40kB of JavaScript to
 * move a few dots is a bad trade when the alternative is a dozen lines.
 *
 * Both people get this identically. The person who submitted first sees it hours
 * later from a cold open, so there is no "you already saw this" state and no
 * diminished second-time version.
 */

export interface RevealProps {
  question: Question
  dayIndex: number
  syncScore: number
  streak: number
  myFirstName: string
  theirFirstName: string
  myTruth: AnswerPayload
  myGuess: AnswerPayload
  theirTruth: AnswerPayload
  theirGuess: AnswerPayload
  /** How well I read them. */
  iReadThem: number
  /** How well they read me. */
  theyReadMe: number
  /** Tender this day paid each of them, or null before Phase 3 data exists. */
  earned: number | null
  /**
   * Rungs on the tender ladder crossed on this day, if any.
   *
   * Read per day rather than from tender_standing(), which returns only the highest —
   * once a couple passes five million, standing stops mentioning the million and the
   * reveal where they crossed it would lose its marker.
   */
  marks: Mark[]
}

/** Stage gates. Milliseconds from mount. */
const STAGES = [
  0, //    0 — sealed, holding
  320, //  1 — the seal breaks, the score arrives and starts counting
  1400, // 2 — the verdict line
  1720, // 3 — the two readings
  2060, // 4 — the answers, staggered from here
  2600, // 5 — the footer
] as const

const COUNT_MS = 950

export function RevealView(props: RevealProps) {
  const {
    question,
    dayIndex,
    syncScore,
    streak,
    myFirstName,
    theirFirstName,
    myTruth,
    myGuess,
    theirTruth,
    theirGuess,
    iReadThem,
    theyReadMe,
    earned,
    marks,
  } = props

  const { stage, reduced } = useRevealSequence()
  const at = (n: number) => stage >= n

  const shown = useCountUp(syncScore, at(1), reduced)

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '2.5rem' }}>
      <header className="pt-6 text-center">
        <p
          className="t-label mb-5"
          style={fade(at(1), { delay: 60 })}
        >
          Today, together
        </p>

        {/* The seal and the score occupy the same space; one gives way to the
            other rather than the page reflowing between them. */}
        <div className="relative flex h-[clamp(3.4rem,12vw,5rem)] items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center gap-2"
            style={{
              opacity: at(1) ? 0 : 1,
              transform: at(1) ? 'scale(1.35)' : 'scale(1)',
              filter: at(1) ? 'blur(6px)' : 'blur(0px)',
              transition: reduced
                ? 'none'
                : 'opacity 380ms var(--ease-out-quart), transform 520ms var(--ease-out-expo), filter 380ms linear',
            }}
          >
            <Dot />
            <Dot />
          </span>

          <p
            className="t-display tabular text-ink"
            aria-label={`${syncScore} percent in sync`}
            style={{
              opacity: at(1) ? 1 : 0,
              transform: at(1) ? 'scale(1)' : 'scale(0.86)',
              transition: reduced
                ? 'none'
                : `opacity 420ms var(--ease-out-quart), transform 720ms var(--ease-out-expo)`,
            }}
          >
            {shown}
            <span className="align-top text-[0.42em] text-ink-muted">%</span>
          </p>
        </div>

        <p
          className="t-body mx-auto mt-4 max-w-[22rem] text-ink-muted"
          style={fade(at(2), { reduced })}
        >
          {characterise(syncScore, theirFirstName)}
        </p>

        <div
          className="mt-5 flex items-center justify-center gap-3"
          style={fade(at(2), { reduced, delay: 120 })}
        >
          {streak > 1 ? (
            <span className="t-small text-ink-faint">{streak} days running</span>
          ) : null}
          {streak > 1 && earned !== null ? (
            <span aria-hidden className="text-ink-faint">·</span>
          ) : null}
          {/* The payout belongs here. This is the screen where accuracy becomes
              money, and the connection is the entire thesis of the product. */}
          {earned !== null ? (
            <span className="t-small tabular text-ink-muted">
              {tender(earned)} each
            </span>
          ) : null}
        </div>
      </header>

      {/* After the score, before everything else. It belongs to the day rather than to
          the answers, and putting it below the facets would bury the biggest thing that
          happened underneath the smallest. */}
      {marks.length > 0 ? (
        <div style={rise(at(3), { reduced, delay: 60 })}>
          <MilestoneBanner
            marks={marks}
            theirName={theirFirstName}
            dayIndex={dayIndex}
            open={at(3)}
          />
        </div>
      ) : null}

      <Rule />

      <section className="stack" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <div className="flex items-baseline justify-between gap-6">
          <div style={rise(at(3), { reduced })}>
            <Reading name={theirFirstName} score={iReadThem} label="you read" />
          </div>
          <div style={rise(at(3), { reduced, delay: 110 })}>
            <Reading name={myFirstName} score={theyReadMe} label="they read" align="right" />
          </div>
        </div>

        {question.facets.map((facet, facetIndex) => (
          <div
            key={facet.id}
            className="stack"
            style={{
              ['--stack-gap' as string]: '1.25rem',
              ...rise(at(4), { reduced, delay: facetIndex * 160 }),
            }}
          >
            <p className="t-label">{withPartnerName(facet.ask, theirFirstName)}</p>

            <Comparison
              facet={facet}
              subject={theirFirstName}
              guesser="You"
              truth={theirTruth[facet.id]}
              guess={myGuess[facet.id]}
              open={at(4)}
              delay={facetIndex * 160 + 120}
              reduced={reduced}
            />

            <Comparison
              facet={facet}
              subject="You"
              guesser={theirFirstName}
              truth={myTruth[facet.id]}
              guess={theirGuess[facet.id]}
              open={at(4)}
              delay={facetIndex * 160 + 260}
              reduced={reduced}
            />
          </div>
        ))}
      </section>

      <Rule />

      <footer
        className="stack pb-4"
        style={{ ['--stack-gap' as string]: '0.75rem', ...fade(at(5), { reduced }) }}
      >
        <ShareCardButton
          dayIndex={dayIndex}
          syncScore={syncScore}
          myFirstName={myFirstName}
          theirFirstName={theirFirstName}
        />
        <Link href="/" className="block">
          <Button variant="quiet">Done</Button>
        </Link>
        <p className="t-small text-center text-ink-faint">
          Tomorrow’s question arrives at midnight.
        </p>
      </footer>
    </div>
  )
}

function Dot() {
  return <span className="block size-2.5 rounded-full bg-sealed" />
}

function Reading({
  name,
  score,
  label,
  align = 'left',
}: {
  name: string
  score: number
  label: string
  align?: 'left' | 'right'
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="t-label mb-1.5">
        {label} {name}
      </p>
      <p className="font-serif text-[1.75rem] leading-none tracking-tight text-ink tabular">
        {score}
        <span className="text-[0.5em] text-ink-faint">%</span>
      </p>
    </div>
  )
}

function Comparison({
  facet,
  subject,
  guesser,
  truth,
  guess,
  open,
  delay,
  reduced,
}: {
  facet: Facet
  subject: string
  guesser: string
  truth: AnswerPayload[string] | undefined
  guess: AnswerPayload[string] | undefined
  open: boolean
  delay: number
  reduced: boolean
}) {
  // Must pass the neutral ids, or a mutual non-answer renders as a full hit here
  // while the database scored it at half.
  const neutralIds =
    facet.kind === 'choice'
      ? facet.options.filter((o) => o.neutral).map((o) => o.id)
      : undefined

  const score = scoreFacet(facet.kind, truth, guess, neutralIds)

  if (facet.kind === 'choice') {
    return (
      <ChoiceComparison
        facet={facet}
        subject={subject}
        guesser={guesser}
        truth={truth}
        guess={guess}
        hit={score === 100}
        neutralMatch={score === NEUTRAL_MATCH}
      />
    )
  }

  // No silent midpoint. See ScaleMissing — the old `?? 50` drew marks that
  // contradicted the score sitting next to them.
  if (truth === undefined || guess === undefined) {
    return <ScaleMissing facet={facet} subject={subject} guesser={guesser} />
  }

  return (
    <ScaleComparison
      facet={facet}
      subject={subject}
      guesser={guesser}
      truth={Number(truth)}
      guess={Number(guess)}
      score={score}
      open={open}
      delay={delay}
      reduced={reduced}
    />
  )
}

function ChoiceComparison({
  facet,
  subject,
  guesser,
  truth,
  guess,
  hit,
  neutralMatch,
}: {
  facet: ChoiceFacet
  subject: string
  guesser: string
  truth: AnswerPayload[string] | undefined
  guess: AnswerPayload[string] | undefined
  hit: boolean
  neutralMatch: boolean
}) {
  const label = (id: unknown) => facet.options.find((o) => o.id === id)?.label ?? '—'

  return (
    <div className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4">
      <p className="t-small mb-1 text-ink-muted">{subject} said</p>
      <p className="t-title text-ink">{label(truth)}</p>

      <div className="mt-3 flex items-start gap-2 border-t border-hairline pt-3">
        <Mark hit={hit || neutralMatch} />
        <div>
          <p className="t-small text-ink-muted">{guesser} guessed</p>
          <p className={`t-body ${hit || neutralMatch ? 'text-ink' : 'text-ink-muted'}`}>
            {label(guess)}
          </p>
          {/* Said out loud rather than silently docked — a score that quietly
              disagrees with an obvious match reads as a bug, not a rule. */}
          {neutralMatch ? (
            <p className="t-small mt-1.5 text-ink-faint">
              Matched — but neither of you gave much away.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * A slider answer against the guess made about it.
 *
 * Drawn as two marks on one track with the gap between them tinted, rather than
 * as two numbers. The distance *is* the information, and a gap you can see lands
 * in a way "70 vs 45" never does.
 *
 * The marks start together in the middle and open to their true positions, so
 * the gap is something that happens rather than something already drawn.
 *
 * ── Why the marks are named on the track ─────────────────────────────────
 *
 * They were not, and people told us the card was confusing. Filled meant "what
 * they said" and hollow meant "what the other one guessed", and that mapping
 * existed nowhere on screen — only in this comment. Worse, it could not be
 * inferred: the two cards for one facet run in opposite directions, so the filled
 * mark lands left of the hollow one on the first card and right of it on the
 * second. Somebody trying to learn the rule from the two examples in front of
 * them got contradictory evidence.
 *
 * So each mark carries the name of whoever put it there. A key at the bottom of
 * the card was the obvious alternative and is worse: a key is a lookup, and the
 * whole problem is that reading this card required a lookup.
 *
 * Above the track for the truth, below it for the guess. Staggering rather than
 * sitting them on one line is what makes it safe — two captions on the same row
 * would collide as the marks converge, and the collision would be worst exactly
 * when the couple did best. Stacked, they can never touch, and the vertical
 * position becomes a second cue reinforcing which mark is which.
 */
function ScaleComparison({
  facet,
  subject,
  guesser,
  truth,
  guess,
  score,
  open,
  delay,
  reduced,
}: {
  facet: ScaleFacet
  subject: string
  guesser: string
  truth: number
  guess: number
  score: number
  open: boolean
  delay: number
  reduced: boolean
}) {
  const lo = Math.min(truth, guess)
  const span = Math.abs(truth - guess)
  /*
    Close enough that two marks would overlap, so they are drawn as one.

    This is the bug fix, not a flourish. The guess mark paints after the truth mark
    and its fill is opaque, so at a small gap the ring simply covered the filled
    dot and the tinted span between them had no width — a *perfect* read rendered
    as one empty circle, which reads as a marker that failed to load. The best
    outcome in the product was the only one that looked broken.
  */
  const merged = span <= MERGE_GAP

  const ease = reduced
    ? 'none'
    : `left 760ms var(--ease-out-expo) ${delay}ms, width 760ms var(--ease-out-expo) ${delay}ms`

  const them = guesser.toLowerCase() === 'you' ? 'you' : guesser

  return (
    <div className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        {/* A direction, not a sentence with a middot in it. Deliberately the same
            "you read / they read" vocabulary as the two figures at the top of this
            screen, so the reveal speaks one language rather than two. */}
        <p className="t-small text-ink-muted">
          {guesser} read {subject.toLowerCase() === 'you' ? 'you' : subject}
        </p>
        {/* Word first, number second. A bare percentage sitting on top of a 0-100
            track reads as a position on that track, which is why a 48% next to a
            mark at three-quarters looked like a fault. */}
        <p className="t-small text-ink-muted">
          {closeness(span)} ·{' '}
          <span className="tabular text-ink">{score}%</span>
        </p>
      </div>

      {/* Fixed heights on the caption rows rather than letting them size to their
          content: the track must not shift vertically between a merged card and an
          open one, or a column of these cards jitters as you read down it. */}
      <div className="relative h-[1.125rem]">
        <MarkLabel at={open ? truth : 50} tone="strong" ease={ease}>
          {merged ? `${subject} · ${them}` : subject}
        </MarkLabel>
      </div>

      <div
        className="relative h-6"
        role="img"
        aria-label={gapSentence(facet, subject, guesser, truth, guess, score)}
      >
        <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-hairline-strong" />

        <span
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${open ? lo : 50}%`, width: `${open ? span : 0}%`, transition: ease }}
        />

        {merged ? (
          /* One mark, both of them: a filled core inside a ring. It carries both
             shapes at once, so it does not need its own legend either. */
          <>
            <span
              className="absolute top-1/2 size-[1.375rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-paper-raised"
              style={{ left: `${open ? truth : 50}%`, transition: ease }}
            />
            <span
              className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${open ? truth : 50}%`, transition: ease }}
            />
          </>
        ) : (
          <>
            {/* Truth — filled. */}
            <span
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent"
              style={{ left: `${open ? truth : 50}%`, transition: ease }}
            />

            {/* Guess — hollow. */}
            <span
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-paper-raised"
              style={{ left: `${open ? guess : 50}%`, transition: ease }}
            />
          </>
        )}
      </div>

      <div className="relative h-[1.125rem]">
        {merged ? null : (
          <MarkLabel at={open ? guess : 50} tone="muted" ease={ease}>
            {them} guessed
          </MarkLabel>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-4">
        <span className="t-small text-ink-faint">{facet.minLabel}</span>
        <span className="t-small text-right text-ink-faint">{facet.maxLabel}</span>
      </div>
    </div>
  )
}

/**
 * A caption pinned to a mark's position.
 *
 * Travels with the mark on the same easing and delay, so a name never detaches
 * from the dot it belongs to while the card opens.
 *
 * The anchor switches near the ends instead of always centring. A centred caption
 * at 98% hangs half its width off the card, and "Today" is exactly where a slider
 * answer most often lands — the extremes are the common case here, not the edge
 * case. Three fixed bands rather than measuring the text: measurement means a
 * layout read on every reveal to decide how to draw it, and the visible difference
 * is a few pixels of alignment.
 */
function MarkLabel({
  at,
  tone,
  ease,
  children,
}: {
  at: number
  tone: 'strong' | 'muted'
  ease: string
  children: ReactNode
}) {
  const anchor = at <= 12 ? 'translateX(0)' : at >= 88 ? 'translateX(-100%)' : 'translateX(-50%)'

  return (
    <span
      className={`t-small absolute whitespace-nowrap ${
        tone === 'strong' ? 'text-ink' : 'text-ink-muted'
      }`}
      style={{ left: `${at}%`, transform: anchor, transition: ease, bottom: 0 }}
    >
      {children}
    </span>
  )
}

/**
 * A scale facet with nothing recorded on one side.
 *
 * Previously this fell back to `truth ?? 50` and drew a mark in the middle of the
 * track — while `scoreFacet` was called with the raw `undefined` and returned 0. So
 * a row missing an answer could render two marks close together above a 0%, which
 * is a card arguing with itself. Submission validation makes this unreachable for
 * anything answered through the app; it exists so one legacy row cannot make a
 * reveal look broken, and saying "missing" is the only honest way to do that.
 */
function ScaleMissing({ facet, subject, guesser }: { facet: ScaleFacet; subject: string; guesser: string }) {
  return (
    <div className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4">
      <p className="t-small mb-1 text-ink-muted">
        {guesser} read {subject.toLowerCase() === 'you' ? 'you' : subject}
      </p>
      <p className="t-body text-ink-muted">No slider answer was recorded for this one.</p>
      <span className="sr-only">
        {facet.minLabel} to {facet.maxLabel}. Nothing recorded, so it scored zero.
      </span>
    </div>
  )
}

/**
 * Hit-or-miss indicator.
 *
 * The tick is only rendered when it's actually a hit, rather than always present
 * and hidden with transparent text — otherwise anything reading the DOM sees a ✓
 * on a miss. And since colour and shape are the only visual signal, the state is
 * also stated in text for screen readers, which would otherwise get no
 * indication of whether the guess was right at all.
 */
function Mark({ hit }: { hit: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={`mt-1 flex size-4 shrink-0 items-center justify-center rounded-full text-[0.5rem] font-bold ${
          hit ? 'bg-accent text-accent-ink' : 'border border-hairline-strong'
        }`}
      >
        {hit ? '✓' : ''}
      </span>
      <span className="sr-only">{hit ? 'Guessed right.' : 'Guessed wrong.'}</span>
    </>
  )
}

/** One sentence, never scolding. A bad day is information, not a failure. */
function characterise(score: number, them: string): string {
  if (score >= 90) return 'You read each other almost exactly.'
  if (score >= 75) return 'Close, both ways.'
  if (score >= 55) return 'Some of it landed. Some of it didn’t.'
  if (score >= 35) return 'A fair bit of daylight between you today.'
  return `You each had ${them === 'them' ? 'the other' : them} somewhere else entirely today.`
}

/* ---------------------------------------------------------------------------
   Sequencing
   --------------------------------------------------------------------------- */

/** Opacity-only entrance. */
function fade(on: boolean, opts: { reduced?: boolean; delay?: number } = {}) {
  return {
    opacity: on ? 1 : 0,
    transition: opts.reduced ? 'none' : `opacity 420ms var(--ease-out-quart) ${opts.delay ?? 0}ms`,
  }
}

/** Opacity plus a short lift. */
function rise(on: boolean, opts: { reduced?: boolean; delay?: number } = {}) {
  const delay = opts.delay ?? 0
  return {
    opacity: on ? 1 : 0,
    transform: on ? 'translate3d(0,0,0)' : 'translate3d(0,12px,0)',
    transition: opts.reduced
      ? 'none'
      : `opacity 480ms var(--ease-out-quart) ${delay}ms, transform 640ms var(--ease-out-expo) ${delay}ms`,
  }
}

/**
 * Walks the stage counter.
 *
 * Reduced motion jumps straight to the end. Honouring the preference means
 * *removing* the animation, not replaying it faster — a 1ms version of this
 * sequence is a flicker, which is worse than no sequence at all.
 */
function useRevealSequence(): { stage: number; reduced: boolean } {
  const [stage, setStage] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Every state change goes through a timer, including the reduced-motion jump,
    // so nothing is written synchronously from the effect body.
    const timers = prefersReduced
      ? [
          window.setTimeout(() => {
            setReduced(true)
            setStage(STAGES.length - 1)
          }, 0),
        ]
      : STAGES.flatMap((at, index) =>
          index === 0 ? [] : [window.setTimeout(() => setStage(index), at)],
        )

    /**
     * The buzz lands with the seal breaking — stage 1, where the score arrives —
     * not on mount and not at the end. It is the beat the whole sequence is built
     * around, and a vibration a second early or late reads as unrelated to it.
     *
     * Scheduled on its own timer rather than inside the stage-1 callback so it
     * survives that callback being restructured, and so it is cancelled by the
     * same cleanup if the page is left before the reveal plays.
     *
     * Skipped under reduced motion. Somebody who asked for less movement did not
     * ask for a phone that jumps in their hand.
     */
    if (!prefersReduced) {
      timers.push(window.setTimeout(() => haptic('reveal'), STAGES[1]))
    }

    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
  }, [])

  return { stage, reduced }
}

/**
 * Counts the score up once `active` goes true.
 *
 * No "have I already run" ref guard, deliberately. The cleanup below cancels any
 * in-flight frame, so re-running is safe — whereas a ref guard survives React's
 * mount → cleanup → mount cycle and permanently disables the animation, leaving
 * the hero number frozen at 0. Showing the wrong score is far worse than
 * replaying an animation.
 */
function useCountUp(target: number, active: boolean, reduced: boolean): number {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) return

    // Zero duration rather than an early setValue: reduced-motion users land on
    // the final number on the first frame, and the value is still only ever
    // written from inside the animation callback.
    const duration = reduced ? 0 : COUNT_MS
    const startedAt = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration)
      // Ease-out quart: quick, then a long settle onto the final digit.
      setValue(Math.round(target * (1 - Math.pow(1 - t, 4))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, active, reduced])

  return value
}
