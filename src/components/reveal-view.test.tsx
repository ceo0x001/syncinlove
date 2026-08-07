import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RevealView, type RevealProps } from './reveal-view'
import type { Question } from '@/lib/questions/types'

/**
 * The bug this file exists for.
 *
 * A perfect read rendered as nothing. The guess mark is painted after the truth mark
 * with an opaque fill, so at a small gap the ring simply covered the filled dot and the
 * tinted span between them had zero width — the best possible outcome was the only one
 * that looked like a marker which had failed to load.
 *
 * Invisible in source: two absolutely positioned spans, correct coordinates, correct
 * colours. It needed rendering to see, and the fix needed rendering to confirm.
 *
 * The second thing here is the labelling. Users said the card was confusing, and it
 * was: filled meant "what they said", hollow meant "what the other one guessed", and
 * that mapping existed nowhere on screen. Worse, the two cards for one facet run in
 * opposite directions, so the filled mark lands left of the hollow one on the first and
 * right of it on the second — somebody learning the rule from the two examples in front
 * of them got contradictory evidence.
 */

const QUESTION: Question = {
  id: 'q-test',
  category: 'light',
  intensity: 1,
  renewable: true,
  prompt: 'The last thing that made you properly laugh.',
  facets: [
    {
      kind: 'scale',
      id: 'recency',
      ask: 'How recent?',
      askAbout: 'How recent for {them}?',
      minLabel: 'Been a while',
      maxLabel: 'Today',
    },
  ],
}

function reveal(theirTruth: number, myGuess: number, myTruth: number, theirGuess: number) {
  const props: RevealProps = {
    question: QUESTION,
    dayIndex: 12,
    syncScore: 50,
    streak: 3,
    myFirstName: 'BabyCakes',
    theirFirstName: 'Dada',
    myTruth: { recency: myTruth },
    myGuess: { recency: myGuess },
    theirTruth: { recency: theirTruth },
    theirGuess: { recency: theirGuess },
    iReadThem: 50,
    theyReadMe: 40,
    earned: 1200,
  }
  const view = render(<RevealView {...props} />)
  // The reveal is choreographed on timers; run them all so the marks are open rather
  // than still stacked in the middle where they start.
  act(() => {
    vi.advanceTimersByTime(4000)
  })
  return view
}

/*
  The marks are the only unlabelled thing on the card, so they are found structurally.

  Positioned spans only: the first child of each track is the base rail, which spans
  the full width via inset-x-0 and carries no `left`. Including it made an early
  version of the "opens apart" assertion fail against perfectly good code — the empty
  string is not 50%.
*/
const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="img"] > span')]
    .map((el) => ({
      className: el.className,
      left: (el as HTMLElement).style.left,
    }))
    .filter((m) => m.left !== '')

describe('RevealView — the slider card', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('names both people on the track, in both directions', () => {
    // The fix for the reported confusion. Each mark carries the name of whoever put it
    // there, so the card needs no legend and no lookup.
    reveal(73, 98, 100, 70)

    expect(screen.getByText('You read Dada')).toBeInTheDocument()
    expect(screen.getByText('Dada read you')).toBeInTheDocument()
    expect(screen.getByText('you guessed')).toBeInTheDocument()
    expect(screen.getByText('Dada guessed')).toBeInTheDocument()
  })

  it('leads the score with a word, so it cannot read as a slider position', () => {
    // A bare percentage sitting above a 0-100 track reads as a position on that track.
    reveal(73, 98, 100, 70)
    expect(screen.getAllByText(/Some daylight/).length).toBeGreaterThan(0)
  })

  /*
    The one that matters. A gap of 2 is 96% — as close to perfect as this scale gets —
    and it used to draw as a single empty ring.
  */
  /*
    Paint order is the whole bug, so paint order is what this asserts.

    A first version checked only that some mark carried `bg-accent`, and it passed
    against the broken component — because the truth mark is filled in BOTH versions.
    The test was true and useless, which is the same failure as the pace form's first
    assertion, found the same way: by putting the bug back.

    What distinguishes them is which mark is painted last. Broken: two identically sized
    marks, the opaque hollow one last, covering the filled one — a perfect read drew as
    an empty ring. Fixed: a large ring first, then a smaller filled core on top, so the
    solid centre is always visible.
  */
  it('draws a near-perfect read as one bullseye rather than a vanishing mark', () => {
    const { container } = reveal(70, 72, 70, 71)
    // Drop the tinted span between the marks; only the marks themselves matter here.
    const drawn = marks(container).filter((m) => m.className.includes('rounded-full') && !m.className.includes('h-[3px]'))

    const last = drawn[drawn.length - 1]
    expect(last.className, 'the topmost mark must be the solid one').toContain('bg-accent')
    expect(last.className, 'and it must not be the paper-coloured ring').not.toContain(
      'bg-paper-raised',
    )

    // Two marks of DIFFERENT sizes — a ring and a core — rather than two of the same
    // size where one hides the other.
    const sizes = new Set(
      drawn.map((m) => m.className.split(' ').find((c) => c.startsWith('size-')) ?? ''),
    )
    expect(sizes.size, 'a ring and a core, not two identical dots').toBeGreaterThan(1)

    // And it says so, rather than leaving the couple to infer it from a dot.
    expect(screen.getAllByText(/Almost exactly/).length).toBeGreaterThan(0)
  })

  it('labels the merged mark with both names, since one mark is both of them', () => {
    reveal(70, 72, 70, 71)
    expect(screen.getAllByText(/Dada · you/).length).toBeGreaterThan(0)
  })

  it('opens the marks apart rather than drawing the gap pre-formed', () => {
    const { container } = render(
      <RevealView
        question={QUESTION}
        dayIndex={12}
        syncScore={50}
        streak={3}
        myFirstName="BabyCakes"
        theirFirstName="Dada"
        myTruth={{ recency: 100 }}
        myGuess={{ recency: 98 }}
        theirTruth={{ recency: 10 }}
        theirGuess={{ recency: 70 }}
        iReadThem={50}
        theyReadMe={40}
        earned={1200}
      />,
    )

    // Before the sequence reaches the answers, both marks sit at the midpoint — the gap
    // is something that happens rather than something already there.
    const atStart = marks(container)
    expect(atStart.every((m) => m.left === '50%')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    const opened = marks(container)
    expect(opened.some((m) => m.left !== '50%')).toBe(true)
  })

  it('says nothing recorded rather than inventing a midpoint', () => {
    // The old fallback drew `truth ?? 50` while scoreFacet, called with the raw
    // undefined, returned 0 — a card arguing with itself.
    render(
      <RevealView
        question={QUESTION}
        dayIndex={12}
        syncScore={0}
        streak={0}
        myFirstName="BabyCakes"
        theirFirstName="Dada"
        myTruth={{}}
        myGuess={{}}
        theirTruth={{}}
        theirGuess={{}}
        iReadThem={0}
        theyReadMe={0}
        earned={null}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getAllByText(/No slider answer was recorded/).length).toBeGreaterThan(0)
  })
})
