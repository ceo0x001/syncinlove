import type { Question } from '../types'
import { LIGHT } from './light'
import { LOGISTICS } from './logistics'
import { DEEP } from './deep'
import { FRICTION } from './friction'
import { DESIRE } from './desire'
import { FUTURE } from './future'

/**
 * The question bank: 60 questions across six axes.
 *
 * Written to hold up across very different couples — long-distance, three weeks
 * in, twenty years in, queer, non-monogamous, living apart. So: nothing assumes
 * you share an address, a bed, a bank account, children, a marriage, or a
 * gender. `{them}` is the only name that ever appears.
 */

export const QUESTIONS: Question[] = [
  ...LIGHT,
  ...LOGISTICS,
  ...DEEP,
  ...FRICTION,
  ...DESIRE,
  ...FUTURE,
]

/**
 * The order every pair walks, starting at day 0.
 *
 * Deliberately not shuffled per pair. The ramp is the point, and it is the most
 * load-bearing content decision in the app:
 *
 *   Week 1      light and practical only. Earn the right to ask anything else.
 *   Week 2      the first real feelings, the first look forward.
 *   Week 3-4    friction enters — gently, and never as an accusation.
 *   Week 5      desire enters, once the ritual has been kept for a month.
 *   Week 6-9    the heavier end of every axis, always with lightness between.
 *
 * Two rules held throughout: no two consecutive days from the same axis, and
 * nothing heavy on consecutive days. A pair whose second question is "what do
 * you suspect I don't fully know about you" does not come back for a third.
 */
export const SEQUENCE: string[] = [
  // ---- Week 1. Easy, warm, quick. -----------------------------------------
  'q-sleep',
  'q-help-this-week',
  'q-free-evening',
  'q-rest',
  'q-laugh',
  'q-week-full',
  'q-need-more-of',

  // ---- Week 2. Practical texture, first feelings, first glance forward. ---
  'q-cancelled',
  'q-energy-clock',
  'q-when-upset',
  'q-good-at',
  'q-next-milestone',
  'q-known',
  'q-soundtrack',

  // ---- Week 3. Friction arrives, at its mildest. --------------------------
  'q-food-decision',
  'q-underneath',
  'q-proudest',
  'q-inbox',
  'q-argument-mode',
  'q-guilty',
  'q-pace-of-change',

  // ---- Week 4. Deeper, and the first hard practical questions. -----------
  'q-money-temp',
  'q-after-a-fight',
  'q-miss-most',
  'q-hard-to-ask',
  'q-time-capsule',
  'q-saving-for',
  'q-short-with-you',

  // ---- Week 5. A month in. Desire enters, softly. ------------------------
  'q-swap-phones',
  'q-feel-wanted',
  'q-off-your-plate',
  'q-where-we-are',
  'q-touch-timing',
  'q-notice',
  'q-work-three-years',

  // ---- Week 6. -----------------------------------------------------------
  'q-chore',
  'q-short-of',
  'q-wish-id-ask',
  'q-whos-around',
  'q-gesture',
  'q-hardest-week',
  'q-still-looking-for',

  // ---- Week 7. -----------------------------------------------------------
  'q-last-desired',
  'q-unfair-share',
  'q-where-based',
  'q-in-public',
  'q-ends-it',
  'q-attention-form',
  'q-crisis',

  // ---- Week 8. -----------------------------------------------------------
  'q-flirt',
  'q-who-folds',
  'q-regret',
  'q-chosen',
  'q-made-peace',
  'q-worst-moment',
  'q-whose-career',

  // ---- Week 9. The heaviest, last. ---------------------------------------
  'q-initiating',
  'q-dont-know',
  'q-afraid-changes',
  'q-ten-years',
]

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]))

/**
 * The questions worth asking twice, in sequence order.
 *
 * Trait questions are excluded: both partners saw each other's answer at the
 * reveal, so asking again scores full marks from memory. Recycling them would
 * inflate every score across the second pass for reasons unconnected to the
 * couple — and once accuracy pays tender, inflate the economy with them.
 */
const RENEWABLE = SEQUENCE.filter((id) => BY_ID.get(id)?.renewable)

export function questionById(id: string): Question | undefined {
  return BY_ID.get(id)
}

/**
 * Which question a pair sees on a given day. Pure function of the day index —
 * no scheduler, no cron, no backfill. A pair created ninety seconds ago has
 * today's question immediately, and a pair that goes dormant for a month
 * resumes exactly where the arithmetic says it should.
 *
 * The first pass walks SEQUENCE in order, ramp intact. After that it cycles the
 * renewable subset only. Running dry is a content problem, and the fix is more
 * questions rather than repeats that pay out for remembering.
 */
export function questionForDay(dayIndex: number): Question {
  const day = Math.max(0, Math.floor(dayIndex))

  const id =
    day < SEQUENCE.length
      ? SEQUENCE[day]
      : RENEWABLE[(day - SEQUENCE.length) % RENEWABLE.length]

  const question = BY_ID.get(id)
  if (!question) {
    throw new Error(`SEQUENCE references unknown question id "${id}"`)
  }
  return question
}

/** Renders `{them}` in facet copy. Falls back to something neutral pre-pairing. */
export function withPartnerName(text: string, partnerFirstName?: string | null): string {
  return text.replaceAll('{them}', partnerFirstName?.trim() || 'your partner')
}
