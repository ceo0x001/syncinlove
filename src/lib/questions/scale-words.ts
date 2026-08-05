import type { ScaleFacet } from '@/lib/questions/types'

/**
 * How a slider reads in words.
 *
 * Sliders in this app deliberately show no number — a readout turns the question
 * into a test, and you start optimising digits instead of answering. That decision
 * has a cost: every place that needs to *say* what a position means has to put it
 * into words, and there are now three of them (the input's `aria-valuetext`, the
 * reveal's `aria-label`, and the reveal's closeness phrase).
 *
 * So the words live here rather than in the components. `describePosition` was
 * previously a private function inside `facet-inputs.tsx`, and the reveal needed the
 * same thing — copying it would have been the "rule with two homes" trap, where the
 * copy you didn't change is the one that drifts.
 *
 * Being a plain module rather than a component file also means these are unit
 * tested. That matters more than it looks: the whole reason this file exists is a
 * round of user confusion about a card whose meaning was carried entirely by
 * unlabelled shapes, and the fix is words. Words that silently change band
 * boundaries would be the same bug again.
 */

/**
 * Where a value sits, in the facet's own language.
 *
 * Anchored to the facet's labels rather than to "low" and "high", because "low" on
 * a "Been a while → Today" scale means nothing. The bands are deliberately coarse:
 * this is read aloud, and "seventy-three percent of the way to Today" is worse than
 * "closer to Today".
 */
export function describePosition(value: number, facet: ScaleFacet): string {
  if (value <= 12) return facet.minLabel
  if (value >= 88) return facet.maxLabel
  if (value < 45) return `closer to ${facet.minLabel}`
  if (value > 55) return `closer to ${facet.maxLabel}`
  return 'in the middle'
}

/**
 * Below this many points apart, the two marks are drawn as one.
 *
 * The marks are 14px wide and centred on their value, so on a phone-width track
 * (~300px) anything under about 5 points overlaps. That was a real bug and not a
 * cosmetic one: the guess mark is painted after the truth mark with an opaque
 * fill, so a *perfect* read rendered as a single empty ring — the best possible
 * outcome was the only one that looked like a failed render.
 *
 * A percentage rather than a measured pixel gap because the alternative is
 * measuring the track on every reveal to decide how to draw it, and the honest
 * benefit of that precision is nil — 5 points is 90%, which is "the same spot" by
 * any reading a couple would give it.
 */
export const MERGE_GAP = 5

/**
 * How close a guess came, in two or three words.
 *
 * This exists because the reveal showed a bare `48%` directly above a 0-100 track,
 * and the natural reading of a percentage sitting on top of a slider is "position
 * on the slider" — so the number said 48% while the mark sat at three-quarters and
 * the card looked broken. Leading with the word fixes it: by the time the digits
 * arrive you already know what kind of quantity they are.
 *
 * Never scolding, on purpose. A wide gap is information about a day, not a verdict
 * on a couple — the same rule the summary line at the top of the reveal follows.
 */
export function closeness(gap: number): string {
  if (gap <= MERGE_GAP) return 'Almost exactly'
  if (gap <= 20) return 'Close'
  if (gap <= 45) return 'Some daylight'
  return 'Opposite ends'
}

/**
 * The whole comparison as one sentence, for screen readers.
 *
 * The marks are `role="img"`, so this is the only thing a screen reader gets — and
 * the old version said just "Close", naming neither person and neither position.
 * Somebody listening to the reveal got the closeness of a guess without ever
 * learning what either of them had answered, which is the actual content.
 */
export function gapSentence(
  facet: ScaleFacet,
  subject: string,
  guesser: string,
  truth: number,
  guess: number,
  score: number,
): string {
  const gap = Math.abs(truth - guess)
  const said = lowerFirst(describePosition(truth, facet))
  const guessed = lowerFirst(describePosition(guess, facet))

  if (gap <= MERGE_GAP) {
    return `${subject} said ${said}. ${guesser} guessed the same spot. ${closeness(gap)} — ${score}%.`
  }
  return `${subject} said ${said}. ${guesser} guessed ${guessed}. ${closeness(gap)} — ${score}%.`
}

/**
 * Lowercase the first letter only.
 *
 * `describePosition` returns the facet's own label, which is capitalised because it
 * is a standalone caption under the track ("Been a while"). Dropped mid-sentence
 * that reads as a proper noun, and `toLowerCase()` on the whole string would be
 * wrong the first time a label contains a name or an I.
 */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
