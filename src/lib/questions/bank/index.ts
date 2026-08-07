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
 * The rotation lives in the database now.
 *
 * There used to be a hand-written 60-day RAMP here, a generated tail, a SEQUENCE that
 * concatenated them and a questionForDay that indexed into it. All of it is gone: since
 * 0022 the question a pair sees on a day is a row in pair_days, written the first time
 * that day is asked for and never moved afterwards.
 *
 * What survives is the part that was always the point — the rules for ORDERING the
 * bank, further down as spiralFor. `npm run seed:questions` renders one ordering per
 * pace into question_order, and question_for_pair_day walks it. So this file is still
 * the author of the order; it just no longer pretends to be able to answer "what is
 * today's question" on its own, because that answer depends on a pair's whole history.
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
     * questions would lose them from the ordering entirely — a pace that omits a
     * question is a pace whose couples never see it, and nothing downstream would
     * notice. A visibly imperfect ordering beats a silently incomplete bank, and the
     * no-consecutive-axis test is what makes it loud if this is ever reached.
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
     * That threshold looks too strict and is not. Measured, on the 170-question bank:
     *
     *   gentleLeft > heavyLeft   longest heavy run  7 / 6 / 6   (gentle/standard/bold)
     *   gentleLeft >= heavyLeft  identical — never the deciding comparison
     *   gentleLeft > 0           11 / 17 / 18
     *
     * Always softening is dramatically worse because the front patterns already draw
     * band 1 heavily, so an unconditional preference spends the gentle axes early and
     * hands a long run to the tail. The strict version is the best of the three.
     *
     * What the residual runs actually are: past roughly day 146 the remaining pool is
     * about 15 heavy to 9 gentle, and no ordering of 15 into 10 gaps avoids clustering.
     * The lever is arithmetic, not logic — more questions on light, logistics and
     * future. That claim is now trustworthy in a way it was not the first three times
     * it was made, because the rationing no longer spends them early.
     *
     * A couple experiences the run, not the average, which is why the tests assert the
     * longest run and deliberately do not assert the adjacency percentage — rationing
     * makes that number worse while making the experience better.
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

const OPENER: Record<Pace, readonly string[]> = {
  /*
    Gentle and standard: thirteen days, one axis at a time, nothing hurried.
  */
  gentle: [
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
  ],
  standard: [
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
  ],
  /*
    Bold: the same eight axes in ten days instead of thirteen, so the pattern —
    and with it the harder questions — starts three days sooner.

    Ten and not eight. Eight slots for eight axes means five of them heavy, which
    forces a heavy pair somewhere however they are arranged; two gentle questions
    bought back the spacing. Choosing "bold" should not mean choosing a worse-built
    fortnight.

    Desire lands on day 1 and sex on day 3, both as preference questions. That is the
    setting doing what its own description promises.
  */
  bold: [
    'q-sleep', //             light      — day 0 is q-sleep at every pace
    'q-flirt', //             desire
    'q-help-this-week', //    logistics
    'q-anticipation', //      intimacy
    'q-laugh', //             light
    'q-tone', //              friction
    'q-next-trip', //         future
    'q-money-instinct', //    values
    'q-how-tired', //         logistics
    'q-when-quiet', //        deep
  ],
} as const

/**
 * The floor no pace goes under: nothing at intensity 3 in the first fortnight.
 *
 * Intensity 3 is the exposing end — dealbreakers, what you have not said out loud, the
 * hardest thing to ask for. Two weeks is not enough trust for those whatever somebody
 * ticked in settings, and a couple who chose bold on day one has not met the app yet.
 *
 * It is also what keeps the setting honest. "Nothing is held back for long" is a
 * promise about weeks, not days; without something still to come there is no
 * anticipation to build, which is the thing the users actually asked for.
 *
 * Bold's real difference is band 2 arriving on day 10 rather than day 13, and both
 * heavier bands being far denser after that.
 */
const NO_EXPOSING_BEFORE_DAY = 14

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
 * What every pace settles into: whichever band has the most questions left.
 *
 * This was a fixed proportional pattern, and it failed for the third time in the same
 * way. A fixed share cannot match a pool whose composition it is itself changing:
 * bold's pattern drew band 1 slightly faster than band 1's share of the bank, band 1
 * ran dry a dozen questions before the end, and the tail became pure band 3 — which is
 * 20 heavy against 6 gentle, so the longest heavy run went from four to seven.
 *
 * The same shape as the twelve-day run that gentle-after-heavy caused, and as the
 * gentle axes draining early before that. Three times now: any rule that spends a
 * finite pool at a fixed rate exhausts the thing it is rationing and hands the problem
 * to the tail.
 *
 * Largest-remaining-first cannot do that. Every band drains at the rate it needs to
 * finish alongside the others, so nothing is left over to stack up at the end. It also
 * needs no tuning as the bank grows: add thirty light questions and it rebalances
 * itself, where a fixed pattern would need re-deriving.
 *
 * Pace still means something — the front patterns are untouched, and they are where a
 * couple's first six weeks are decided.
 */
function bandWithMost(remaining: Record<Intensity, number>): Intensity {
  // Ties to the lower band, so a couple gets the gentler of two equal options.
  let best: Intensity = 1
  for (const band of [2, 3] as Intensity[]) {
    if (remaining[band] > remaining[best]) best = band
  }
  return best
}

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
  const opener = OPENER[pace]
  const opened = new Set<string>(opener)
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

  const out = [...opener]
  let prev = BY_ID.get(opener[opener.length - 1])!.category
  let slot = 0

  for (;;) {
    const live = [...queues.entries()].filter(([, ids]) => ids.length > 0)
    if (live.length === 0) break

    /* The pace's own shape for six weeks, then the shared proportional one. */
    const leftInBand: Record<Intensity, number> = { 1: 0, 2: 0, 3: 0 }
    for (const [key, ids] of live) {
      leftInBand[Number(key[0]) as Intensity] += ids.length
    }

    const asked = slot < FRONT_DAYS ? front[slot % front.length] : bandWithMost(leftInBand)
    slot++

    /*
      The floor, applied where the band is chosen rather than where it is drawn.

      Asking for a 2 instead of a 3 keeps the rest of the machinery untouched: the
      band-distance fallback, the axis rule and the gentle rationing all behave as
      normal, and the questions that would have gone here are still in the pool for
      later. Filtering them out at the draw instead would leave gaps to reason about.
    */
    const wanted: Intensity =
      asked === 3 && out.length < NO_EXPOSING_BEFORE_DAY ? 2 : asked

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

export function questionById(id: string): Question | undefined {
  return BY_ID.get(id)
}

/** Renders `{them}` in facet copy. Falls back to something neutral pre-pairing. */
export function withPartnerName(text: string, partnerFirstName?: string | null): string {
  return text.replaceAll('{them}', partnerFirstName?.trim() || 'your partner')
}
