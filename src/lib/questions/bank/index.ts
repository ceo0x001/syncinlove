import type { Category, Question } from '../types'
import { LIGHT } from './light'
import { LOGISTICS } from './logistics'
import { DEEP } from './deep'
import { FRICTION } from './friction'
import { DESIRE } from './desire'
import { FUTURE } from './future'
import { VALUES } from './values'
import { INTIMACY } from './intimacy'

/**
 * The question bank, across eight axes.
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
  ...VALUES,
  ...INTIMACY,
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
const RAMP: readonly string[] = [
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

  // ---- Week 9. The heaviest of the original nine weeks. -------------------
  'q-initiating',
  'q-dont-know',
  'q-afraid-changes',
  'q-ten-years',

] as const

/**
 * Everything after the ramp, ordered by rule rather than by hand.
 *
 * The ramp above stays hand-written. Which question lands on day three is the most
 * load-bearing content decision in this app and is not something to hand to an
 * algorithm.
 *
 * Past that it inverts. SEQUENCE has to contain every question exactly once, so a
 * bank grown toward two years of unique days would mean hand-placing seven hundred
 * ids while checking two invariants across all of them by eye. Worse, it makes every
 * new question expensive: drop one in and the whole array needs re-reading. So the
 * tail is generated, the rules live in code, and adding a question becomes "append
 * it to its axis file".
 *
 * DETERMINISM IS NOT OPTIONAL. SEQUENCE is built once at module load and
 * questionForDay must be a pure function of the day index — two server instances
 * disagreeing about day 200 would serve a couple different questions depending on
 * which one handled the request. No shuffling, no clock, no randomness: same bank
 * in, same order out, on every machine, forever.
 */

/** Axes that ask something costly. Never two in a row if it can be helped. */
const HEAVY: ReadonlySet<Category> = new Set([
  'deep',
  'friction',
  'desire',
  'values',
  'intimacy',
])

/**
 * Greedy interleave: take from the largest remaining axis that is not the one just
 * used, preferring a gentle axis after a heavy one.
 *
 * Largest-remaining-first is what makes the no-consecutive-axis rule hold all the
 * way to the final question. This kind of reordering fails at the tail rather than
 * the start — take anything else and you finish on a run of whichever axis was
 * over-represented.
 *
 * Gentle-after-heavy is a preference, not a rule, because with a heavy-dominated
 * bank strict alternation is arithmetically impossible. It improves on its own as
 * light and logistics grow: every question added to a gentle axis buys spacing
 * everywhere in the tail, with nothing re-ordered by hand.
 */
function interleave(pool: readonly Question[], after: Category | null): string[] {
  const groups = new Map<Category, string[]>()
  for (const q of pool) {
    const list = groups.get(q.category)
    if (list) list.push(q.id)
    else groups.set(q.category, [q.id])
  }

  const out: string[] = []
  let prev = after

  for (;;) {
    const remaining = [...groups.entries()].filter(([, ids]) => ids.length > 0)
    if (remaining.length === 0) break

    const notPrev = remaining.filter(([cat]) => cat !== prev)
    /*
     * Only the previous axis is left. Emitting it breaks the rule, but dropping the
     * questions would lose them from SEQUENCE and fail the permutation check — a
     * visibly imperfect sequence beats a silently incomplete bank. The test
     * asserting no consecutive axes is what makes this loud if it ever happens.
     */
    const usable = notPrev.length > 0 ? notPrev : remaining

    const gentle =
      prev !== null && HEAVY.has(prev) ? usable.filter(([cat]) => !HEAVY.has(cat)) : []
    const tier = gentle.length > 0 ? gentle : usable

    // Count first, then axis name. The second key is what makes this stable rather
    // than dependent on Map insertion order.
    tier.sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))

    const [cat, ids] = tier[0]
    out.push(ids.shift() as string)
    prev = cat
  }

  return out
}

const RAMP_SET = new Set<string>(RAMP)
const RAMP_LAST = QUESTIONS.find((q) => q.id === RAMP[RAMP.length - 1])?.category ?? null

/**
 * The order every pair walks, ramp first.
 *
 * Still a permutation of QUESTIONS, which the tests check. The tail is every
 * question the ramp does not name, so a new question joins it automatically and none
 * can be silently dropped.
 */
export const SEQUENCE: string[] = [
  ...RAMP,
  ...interleave(
    QUESTIONS.filter((q) => !RAMP_SET.has(q.id)),
    RAMP_LAST,
  ),
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
