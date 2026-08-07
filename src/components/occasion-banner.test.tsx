import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { OccasionBanner } from './occasion-banner'
import { matchMediaMatches } from '@/test/setup'

/**
 * The bug this file exists for.
 *
 * The confetti never fired for anybody, and every signal said it had. The seen-key was
 * written, no error was thrown, reduced motion was off. It shipped, sat broken for a
 * day, and was only found because somebody looked at the screen.
 *
 * The cause was ordering. `mayAnimate` comes from useSyncExternalStore, whose server
 * snapshot is `false` — so the effect runs once with false during hydration and again
 * with the real value. When the seen-key was written before the motion check, that
 * first pass claimed the day and returned, and the second found the flag already set.
 *
 * No unit test could see this: the logic is correct in isolation and only wrong in the
 * presence of a hydration render. That is the whole argument for this project.
 *
 * ── What these tests do and do not prove ─────────────────────────────────
 *
 * Verified by putting the bug back and running them: exactly one of the seven fails,
 * "does not spend the day when it could not animate". The others pass with the broken
 * code, and it is worth knowing why rather than assuming the suite is stronger than it
 * is.
 *
 * jsdom has no hydration pass. `mayAnimate` is true from the first render here, so the
 * false-then-true sequence that caused the production failure never happens. What these
 * tests catch is the CLASS of the bug — claiming the day before earning it — through
 * the reduced-motion route, which is the same ordering error reached a different way.
 *
 * The genuine hydration sequence would need a server render followed by hydrateRoot.
 * That is worth adding if this bites again; it is not here yet, and pretending
 * otherwise is how a green suite becomes a false alibi.
 */

const OCCASION = {
  id: 'test-day',
  on: '08-01',
  headline: 'Happy Test Day.',
  note: 'A note that sits under the headline.',
} as const

const pieces = (container: HTMLElement) =>
  container.querySelectorAll('.occasion-confetti > span').length

describe('OccasionBanner', () => {
  it('fires on the first open of the day', () => {
    const { container } = render(<OccasionBanner occasion={OCCASION} today="2026-08-01" />)

    // The assertion that would have failed before the fix, and the only one that
    // distinguishes "ran" from "returned early having claimed the day".
    expect(pieces(container)).toBeGreaterThan(0)
    expect(screen.getByText('Happy Test Day.')).toBeInTheDocument()
  })

  it('does not fire again on a later load the same day', () => {
    const { unmount, container } = render(
      <OccasionBanner occasion={OCCASION} today="2026-08-01" />,
    )
    expect(pieces(container)).toBeGreaterThan(0)
    unmount()

    // A burst on every navigation stops being a celebration by the third one.
    const second = render(<OccasionBanner occasion={OCCASION} today="2026-08-01" />)
    expect(pieces(second.container)).toBe(0)
  })

  it('fires again the following year, because the key carries the date', () => {
    const first = render(<OccasionBanner occasion={OCCASION} today="2026-08-01" />)
    expect(pieces(first.container)).toBeGreaterThan(0)
    first.unmount()

    const next = render(<OccasionBanner occasion={OCCASION} today="2027-08-01" />)
    expect(pieces(next.container)).toBeGreaterThan(0)
  })

  it('gives somebody who asked for less movement the message without the movement', () => {
    matchMediaMatches(true)
    const { container } = render(<OccasionBanner occasion={OCCASION} today="2026-08-01" />)

    // The banner and the teddy still arrive. Forty things flying across the screen do
    // not — honouring the preference means removing the animation, not shortening it.
    expect(screen.getByText('Happy Test Day.')).toBeInTheDocument()
    expect(pieces(container)).toBe(0)
  })

  /*
    And the half of that which is easy to get wrong: a reduced-motion visit must not
    consume the day. If it wrote the seen-key on the way past, somebody who turns the
    preference off later would find the burst already spent — which is exactly the
    shape of the original bug, one level along.
  */
  it('does not spend the day when it could not animate', async () => {
    matchMediaMatches(true)
    const quiet = render(<OccasionBanner occasion={OCCASION} today="2026-08-01" />)
    expect(pieces(quiet.container)).toBe(0)
    quiet.unmount()

    matchMediaMatches(false)
    const loud = render(<OccasionBanner occasion={OCCASION} today="2026-08-01" />)
    expect(pieces(loud.container)).toBeGreaterThan(0)
  })

  it('fires again when the card is tapped', async () => {
    const user = userEvent.setup()
    const { container } = render(<OccasionBanner occasion={OCCASION} today="2026-08-01" />)

    const before = pieces(container)
    expect(before).toBeGreaterThan(0)

    await user.click(screen.getByRole('button'))

    // Re-firing is why every piece's key carries the burst number: with an index key
    // React reuses the same nodes, the CSS animation is never re-applied, and tapping
    // does nothing visible.
    expect(pieces(container)).toBeGreaterThan(0)
  })

  it('is not a button when it cannot animate', () => {
    // A tappable card that cannot animate is a dead control, and a dead control is
    // worse than no control.
    matchMediaMatches(true)
    render(<OccasionBanner occasion={OCCASION} today="2026-08-01" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
