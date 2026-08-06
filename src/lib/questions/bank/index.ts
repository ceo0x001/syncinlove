import type { Category, Intensity, Question } from '../types'
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
 * DETERMINISM IS NOT OPTIONAL, and it is now enforced somewhere else.
 *
 * This used to say questionForDay must be a pure function of the day index, because
 * two server instances disagreeing about day 200 would serve a couple different
 * questions depending on which one answered. That reasoning still holds. What changed
 * is where the guarantee lives: since 0022 the database records which question a pair
 * was asked on which day, so the answer is looked up rather than recomputed, and two
 * instances cannot disagree about a row.
 *
 * SEQUENCE and questionForDay below are no longer the app's path. They are kept
 * because `questions.sequence_position` and the SQL question_for_day(int) still exist
 * and the tests below still describe what that rotation guarantees. Removing them is
 * its own commit — doing it here would mean two things to unpick if the flip needs
 * reverting.
 *
 * The live ordering is spiralFor(pace), further down.
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

    /*
     * Gentle-after-heavy, RATIONED.
     *
     * Unrationed, this preference spent itself. Heavy is about half the bank, so
     * roughly half of all picks forced an extra gentle draw on top of the ordinary
     * largest-first one — gentle drained far faster than its share, and whatever
     * remained at the end was heavy by construction. The result was twelve heavy
     * questions in an unbroken run at the end of the first pass.
     *
     * It survived three rounds of "add more light questions", which is the tell.
     * At 116, 146 and 170 questions the final twelve days were the same solid heavy
     * run, even once gentle outnumbered heavy 87 to 83. Growing the pool cannot fix
     * a rule that spends the pool early.
     *
     * So the preference now only applies while gentle questions still outnumber
     * heavy ones. Once they don't, the gentle ones left are needed to break up what
     * remains, and spending one now to soften a single adjacency costs a worse run
     * later.
     *
     * The trade, measured over the generated tail: the longest heavy run falls from
     * 12 to 4, while heavy-follows-heavy rises from 10% to 19%. That is the right
     * way round. A couple experiences the run, not the average — four heavy days
     * with a break is a hard week, twelve is a reason to stop opening the app, and
     * scattered single adjacencies are barely noticeable.
     */
    const gentleLeft = remaining
      .filter(([cat]) => !HEAVY.has(cat))
      .reduce((n, [, ids]) => n + ids.length, 0)
    const heavyLeft = remaining
      .filter(([cat]) => HEAVY.has(cat))
      .reduce((n, [, ids]) => n + ids.length, 0)

    const gentle =
      prev !== null && HEAVY.has(prev) && gentleLeft > heavyLeft
        ? usable.filter(([cat]) => !HEAVY.has(cat))
        : []
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

/* ---------------------------------------------------------------------------
   The spiral
   ---------------------------------------------------------------------------

   This is the live ordering. The database holds one copy per pace, generated from
   these functions by `npm run seed:questions`, and question_for_pair_day walks it —
   so this file is the author of the order and Postgres is where a pair's own history
   of it is recorded.

   ── Why the ramp is being replaced ────────────────────────────────────────

   Real users asked for the axes to be "shuffled" — they wanted sex, the future and
   the rest to turn up without waiting a month. The ramp holds desire to week 5 and
   the heaviest intimacy deep into the rotation.

   Literal shuffling is the one thing not to build. It breaks determinism, it has no
   build to it — random is unpredictable, not anticipating — and often enough it
   would serve "What do you suspect I don't fully know about you" on somebody's
   second day, which is precisely the failure the ramp exists to prevent.

   What they described is a spiral: every axis present from the start, each lap
   deeper. That needs intensity, which is why `Intensity` exists.

   ── The opener is hand-written, and it is the part that answers the complaint ──

   Thirteen days, every axis, all of it intensity 1. Not generated, for two reasons.

   The first is that a greedy generator cannot do this. `interleave` takes from the
   largest remaining axis, and in band 1 that is light (28) and logistics (27) —
   intimacy has 5. Left to the algorithm, the small axes wait, which reproduces the
   exact complaint. Coverage in the first fortnight is a promise, so it is stated
   rather than hoped for.

   The second is that these are somebody's first two weeks of the product. Day 0 is
   deliberately still `q-sleep`, so nothing changes for a pair on their first day.

   Ordered under both spacing rules — no axis twice in a row, nothing heavy on
   consecutive days — and sex arrives on day 10 as a preference question rather than
   as an interrogation.
   --------------------------------------------------------------------------- */

const OPENER: readonly string[] = [
  'q-sleep', //             light
  'q-help-this-week', //    logistics
  'q-good-at', //           light
  'q-next-trip', //         future
  'q-when-quiet', //        deep
  'q-laugh', //             light
  'q-flirt', //             desire
  'q-energy-clock', //      logistics
  'q-tone', //              friction
  'q-comfort-food', //      light
  'q-anticipation', //      intimacy
  'q-how-tired', //         logistics
  'q-money-instinct', //    values
] as const

export type Pace = 'gentle' | 'standard' | 'bold'

/**
 * Which band each slot draws from, as a repeating pattern.
 *
 * A pattern rather than a percentage because it has to be legible: you can read the
 * shape of a couple's fortnight off the array. It repeats until the bands run dry.
 *
 * Band sizes are 89 / 55 / 26, so `standard` is close to proportional — every band
 * drains at roughly the same rate, which spreads all three intensities across the
 * whole run instead of stacking them at either end.
 *
 * `gentle` front-loads band 1, so it ends heavier: the easy questions are spent
 * early and what remains is what remains. `bold` does the reverse and ends light.
 * That is inherent to a finite bank and worth stating rather than discovering — you
 * cannot have the hard questions early AND late without writing more of them.
 */
const PACE_FRONT: Record<Pace, readonly Intensity[]> = {
  gentle: [1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 3],
  standard: [1, 2, 1, 2, 1, 3, 1, 2, 1, 2, 1, 3],
  bold: [1, 2, 3, 1, 2, 2, 1, 3, 2, 1, 2, 3],
}

/**
 * How long the pace's own pattern lasts before every pace converges.
 *
 * Six weeks. Long enough to be the couple's whole experience of "what is this app
 * like", short enough that no pace paints itself into a corner.
 */
const FRONT_DAYS = 42

/**
 * What every pace settles into: band 1 half the time, and never two heavier slots
 * back to back.
 *
 * Both halves of that are load-bearing, and both were learned the hard way.
 *
 * Half, because band 1 is 89 of 170 questions — 52%. Any pace that draws band 1 more
 * often than that runs out of it and finishes on bands 2 and 3, which is the same
 * spend-the-pool-early trap that gave `interleave` its twelve-day heavy run. A pace
 * cannot be gentle for the whole distance; a finite bank does not allow it. It can
 * only be gentle first, which is what FRONT_DAYS is for.
 *
 * Never adjacent, because bands 2 and 3 are heavy-dominated by construction — the
 * gentle axes are mostly intensity 1, so band 2 is 40 heavy against 15 gentle and
 * band 3 is 20 against 6. Two heavier slots in a row is therefore very close to two
 * heavy questions in a row no matter how the axis rules vote. The earlier patterns
 * had runs of three such slots and produced seven-day heavy stretches at gentle and
 * standard; bold, whose band-1 slots happened to be evenly spread, was the only one
 * that passed. One pace passing by luck is not a design.
 */
const PACE_TAIL: readonly Intensity[] = [1, 2, 1, 2, 1, 3, 1, 2, 1, 2, 1, 3]

/**
 * One pace's full ordering: the opener, then everything else spiralled.
 *
 * Still a permutation of QUESTIONS at every pace — the pattern chooses which band to
 * draw from, and a band that is empty falls through to the others, so nothing is
 * dropped and nothing is served twice.
 *
 * Axis spacing survives because the pick inside a band reuses the same rules
 * `interleave` uses: largest remaining axis that is not the one just served,
 * preferring a gentle axis after a heavy one while gentle questions can be spared.
 */
export function spiralFor(pace: Pace): string[] {
  const opened = new Set<string>(OPENER)
  const front = PACE_FRONT[pace]

  // One queue per (band, axis), each already in axis-spaced order within its band.
  const queues = new Map<string, string[]>()
  for (const band of [1, 2, 3] as Intensity[]) {
    const inBand = QUESTIONS.filter((q) => q.intensity === band && !opened.has(q.id))
    for (const id of interleave(inBand, null)) {
      const cat = BY_ID.get(id)!.category
      const key = `${band}:${cat}`
      const list = queues.get(key)
      if (list) list.push(id)
      else queues.set(key, [id])
    }
  }

  const out = [...OPENER]
  let prev = BY_ID.get(OPENER[OPENER.length - 1])!.category
  let slot = 0

  for (;;) {
    const live = [...queues.entries()].filter(([, ids]) => ids.length > 0)
    if (live.length === 0) break

    /* The pace's own shape for six weeks, then the shared proportional one. */
    const wanted =
      slot < FRONT_DAYS
        ? front[slot % front.length]
        : PACE_TAIL[(slot - FRONT_DAYS) % PACE_TAIL.length]
    slot++

    /*
     * Bands are tried in order of how far they are from the one the pattern asked
     * for, so an empty or blocked band degrades to its nearest neighbour rather
     * than to whatever happens to be biggest. Asking for a 1 and getting a 2 is a
     * much smaller surprise than asking for a 1 and getting a 3.
     */
    const byDistance = ([1, 2, 3] as Intensity[]).sort(
      (a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b,
    )

    /*
     * Two passes, and the second one is the fix for a real bug.
     *
     * With one pass, a band that only had the just-served axis left would emit it
     * anyway — the same-axis fallback was scoped to the band rather than to the whole
     * pool. So at standard pace days 168 and 169 were both `values`, and the heavy
     * run at the tail reached nine, while every other pace passed. Wanting a band is
     * a preference; not repeating an axis is a rule, so the rule has to be tried
     * across all three bands before the preference gives up.
     *
     * The prev-axis pass still exists because the alternative is dropping questions,
     * and a visibly imperfect ordering beats a silently incomplete bank. The
     * no-consecutive-axis test is what makes it loud if it is ever reached.
     */
    let picked: string | null = null
    for (const allowPrev of [false, true]) {
      if (picked !== null) break

      for (const band of byDistance) {
        const candidates = live.filter(([key]) => key.startsWith(`${band}:`))
        if (candidates.length === 0) continue

        const notPrev = candidates.filter(([key]) => key.slice(2) !== prev)
        if (notPrev.length === 0 && !allowPrev) continue
        const usable = notPrev.length > 0 ? notPrev : candidates

        const gentleLeft = live
          .filter(([key]) => !HEAVY.has(key.slice(2) as Category))
          .reduce((n, [, ids]) => n + ids.length, 0)
        const heavyLeft = live
          .filter(([key]) => HEAVY.has(key.slice(2) as Category))
          .reduce((n, [, ids]) => n + ids.length, 0)

        const gentle =
          HEAVY.has(prev) && gentleLeft > heavyLeft
            ? usable.filter(([key]) => !HEAVY.has(key.slice(2) as Category))
            : []
        const tier = gentle.length > 0 ? gentle : usable

        /*
         * Sorted on how much of the AXIS is left across all three bands, not on the
         * length of this one queue.
         *
         * That distinction is the difference between working and not. Splitting the
         * pool into (band, axis) queues quietly broke largest-remaining-first, which
         * is the property that makes no-consecutive-axis hold all the way to the last
         * question: values has 18 questions but they sit in three queues of 4, 10 and
         * 4, so per-queue it always looked small and never got drained. Standard pace
         * finished with two values questions and nothing else to alternate with —
         * days 168 and 169 were both values, and the tail heavy run hit nine.
         *
         * Gentle and bold both passed, which is what made it worth chasing rather
         * than tuning around: one pace failing where two succeed is a bug in the
         * mechanism, not a limit of the bank.
         */
        const axisLeft = new Map<string, number>()
        for (const [key, ids] of live) {
          const axis = key.slice(2)
          axisLeft.set(axis, (axisLeft.get(axis) ?? 0) + ids.length)
        }

        tier.sort(
          (a, b) =>
            (axisLeft.get(b[0].slice(2)) ?? 0) - (axisLeft.get(a[0].slice(2)) ?? 0) ||
            b[1].length - a[1].length ||
            (a[0] < b[0] ? -1 : 1),
        )

        const [key, ids] = tier[0]
        picked = ids.shift() as string
        prev = key.slice(2) as Category
        break
      }
    }

    if (picked === null) break // unreachable: live was non-empty
    out.push(picked)
  }

  return out
}

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
 * The old rotation. NOT what the app serves any more.
 *
 * Superseded by question_for_pair_day in the database, which respects the pair's pace
 * and never re-asks a question they have already had. Kept in step with the SQL
 * question_for_day(int) that still exists, and still covered by the tests describing
 * what the ramp guaranteed.
 *
 * If you are looking for what a couple sees today, it is a row in pair_days.
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
