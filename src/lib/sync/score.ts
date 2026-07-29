import type { AnswerPayload, FacetValue, Question } from '@/lib/questions/types'

/**
 * Sync scoring.
 *
 * Calibration is the thing that matters here:
 *
 *   choice — 100 on an exact match, 0 otherwise. With 4 options, blind guessing
 *            averages 25.
 *   scale  — 100 minus twice the distance, floored at 0. Blind guessing on a
 *            uniform 0-100 slider averages 41.
 *
 * The doubling is deliberate. Plain `100 - distance` leaves a random guesser at
 * 66, which would make every couple look psychic and the number meaningless.
 *
 * Doubling rather than tripling is also deliberate, and it is a trade. Tripling
 * would pull the scale baseline down to 29, nearly matching a 4-option choice —
 * but it would also score a 20-point miss at 40, which is a punishing mark for
 * what is genuinely a close read of a slider. At double, a 20-point miss scores
 * 60 and the rule stays legible: every 5 points off costs 10.
 *
 * The scale baseline sitting above the choice baseline is not a loophole.
 * Facets are always all answered, at fixed equal weights, so there is no choice
 * of which kind to lean on. What matters is the whole-question baseline: a
 * typical choice-plus-scale question leaves a random couple near 33, well below
 * the 75-95 an attuned pair actually scores. That gap is the useful signal.
 *
 * Everything is integer arithmetic on values the client already constrained.
 * No model, no heuristics, no text analysis.
 */

export const SCALE_MIN = 0
export const SCALE_MAX = 100

/** Score awarded when both partners take the same honest non-answer. */
export const NEUTRAL_MATCH = 50

/**
 * Score one facet: how close a guess came to the truth. 0-100, unrounded.
 *
 * `neutralIds` are the option ids on this facet that mean "nothing much" — "I
 * truly don't mind", "Nothing, it's always the same". Matching on one of those
 * scores {@link NEUTRAL_MATCH} rather than full marks.
 *
 * That discount is the point. Those options have to exist, because making
 * somebody invent a feeling they don't have is worse than letting them pass. But
 * if a mutual shrug scored 100, the highest-scoring day the app can produce
 * would be the one where neither person said anything — and once accuracy pays
 * tender, that is an economy that pays best for revealing least.
 *
 * Guessing the shrug correctly is still worth something, so it isn't zero. It
 * just isn't worth as much as knowing an actual answer.
 */
export function scoreFacet(
  kind: 'choice' | 'scale',
  truth: FacetValue | undefined,
  guess: FacetValue | undefined,
  neutralIds?: readonly string[],
): number {
  // A facet somebody skipped scores zero rather than throwing. Submission
  // validation already rejects incomplete payloads; this is so a single bad
  // legacy row can never make a reveal unopenable.
  if (truth === undefined || guess === undefined) return 0

  if (kind === 'choice') {
    if (truth !== guess) return 0
    if (neutralIds?.includes(String(truth))) return NEUTRAL_MATCH
    return 100
  }

  const t = clampScale(Number(truth))
  const g = clampScale(Number(guess))
  if (Number.isNaN(t) || Number.isNaN(g)) return 0

  return Math.max(0, 100 - 2 * Math.abs(t - g))
}

export function clampScale(n: number): number {
  if (Number.isNaN(n)) return NaN
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n)))
}

export interface FacetScore {
  facetId: string
  kind: 'choice' | 'scale'
  score: number
  truth: FacetValue | undefined
  guess: FacetValue | undefined
  /** True when both took the same honest non-answer. The reveal says so. */
  neutralMatch?: boolean
}

export interface DirectionScore {
  /** 0-100, rounded. How well the guesser read the other person. */
  total: number
  facets: FacetScore[]
}

/**
 * One direction: how well `guess` predicted `truth` for this question.
 * Facets are weighted equally — a question's shape is the designer's lever,
 * not a runtime knob, so there is nothing here to tune or mis-tune.
 */
export function scoreDirection(
  question: Question,
  truth: AnswerPayload,
  guess: AnswerPayload,
): DirectionScore {
  const facets: FacetScore[] = question.facets.map((facet) => {
    const neutralIds =
      facet.kind === 'choice'
        ? facet.options.filter((o) => o.neutral).map((o) => o.id)
        : undefined

    const score = scoreFacet(facet.kind, truth[facet.id], guess[facet.id], neutralIds)

    return {
      facetId: facet.id,
      kind: facet.kind,
      score,
      truth: truth[facet.id],
      guess: guess[facet.id],
      neutralMatch: score === NEUTRAL_MATCH && Boolean(neutralIds?.length),
    }
  })

  const mean = facets.length
    ? facets.reduce((sum, f) => sum + f.score, 0) / facets.length
    : 0

  return { total: Math.round(mean), facets }
}

export interface Submission {
  /** What this person said about themselves. */
  self: AnswerPayload
  /** What this person predicted about the other. */
  guess: AnswerPayload
}

export interface SyncResult {
  /** The couple's number for the day. 0-100. */
  sync: number
  /** How well A read B. */
  aReadB: DirectionScore
  /** How well B read A. */
  bReadA: DirectionScore
}

/**
 * The day's sync score.
 *
 * Symmetric on purpose: one number for the couple, both directions weighted
 * equally, so the payout it drives can be identical for both people. Scoring
 * each partner on their own accuracy alone would pay the more attuned partner
 * more and leave the struggling one unable to afford anything — punishing
 * exactly the person already having the harder time.
 */
export function scoreSync(question: Question, a: Submission, b: Submission): SyncResult {
  const aReadB = scoreDirection(question, b.self, a.guess)
  const bReadA = scoreDirection(question, a.self, b.guess)

  return {
    sync: Math.round((aReadB.total + bReadA.total) / 2),
    aReadB,
    bReadA,
  }
}
