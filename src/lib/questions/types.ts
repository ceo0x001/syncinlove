/**
 * Question shapes.
 *
 * Two facet kinds only, deliberately:
 *
 *   choice — one of 3-4 options. Scores 100 or 0.
 *   scale  — a 0-100 slider. Scores on distance, so the day's number lands
 *            anywhere in the range instead of snapping to 0/50/100.
 *
 * Every question carries at least one scale facet. Without one, a single
 * multiple-choice question can only ever score 0, 50 or 100 per direction,
 * which reads as random day to day and makes a 50 feel like an insult rather
 * than information.
 *
 * Both kinds are scored by arithmetic. No user text is ever sent to a model —
 * that is a privacy claim worth being able to make truthfully, and it also
 * means nobody can talk the scorer into a perfect mark.
 */

/**
 * Six axes.
 *
 * `friction` and `desire` arrive late in the rotation on purpose — see SEQUENCE
 * in bank.ts. Nobody's third day should be "what do I do that grates on you",
 * and app-authored questions about wanting need the ritual to have earned it
 * first.
 */
export type Category =
  | 'light'
  | 'logistics'
  | 'deep'
  | 'friction'
  | 'desire'
  | 'future'
  /** Behaviour, values, dealbreakers, goals. The heaviest lifting. */
  | 'values'
  /** Sex, explicitly. Gated deep in the sequence; the app is 18+ attested. */
  | 'intimacy'

export interface ChoiceOption {
  /** Stable within the question. Answers store this, never the label, so a
   *  typo fix later doesn't silently rewrite somebody's history. */
  id: string
  label: string
  /**
   * An honest way to say "nothing much" — "I truly don't mind", "Nothing, it's
   * always the same".
   *
   * These have to exist, because forcing somebody to invent a feeling they don't
   * have is worse than letting them pass. But they can't be free: if both
   * partners take the out they'd match exactly and score full marks for having
   * revealed nothing, which is simultaneously the highest-scoring and least
   * valuable thing the app can produce. Once accuracy pays tender, that would be
   * an economy that rewards shrugging.
   *
   * So a mutual neutral match scores partially. See scoreFacet.
   */
  neutral?: boolean
}

export interface ChoiceFacet {
  kind: 'choice'
  id: string
  /** Asked when answering for yourself. */
  ask: string
  /** Asked when guessing. `{them}` is replaced with the partner's first name. */
  askAbout: string
  options: ChoiceOption[]
}

export interface ScaleFacet {
  kind: 'scale'
  id: string
  ask: string
  askAbout: string
  /** Label at 0. */
  minLabel: string
  /** Label at 100. */
  maxLabel: string
}

export type Facet = ChoiceFacet | ScaleFacet

/**
 * How much a question costs to answer honestly.
 *
 * Category says what a question is *about*. This says what it *asks of you*, and the
 * two are close to independent — which is the whole reason it exists.
 *
 * Before this, "how heavy is it" was inferred from the axis, so an axis could only
 * move through the rotation as a block. That made the real complaint unfixable:
 * people wanted sex and the future to show up in week one, and the only lever was to
 * bring the entire intimacy axis forward — "How often would you actually like sex?"
 * and "What's the hardest thing to ask me for in bed?" at the same time. One of those
 * is a preference you could answer on a second date. The other is not.
 *
 *   1  Answerable on day two. A preference, a piece of state, a fact about the day.
 *      Nothing that needs vulnerability and nothing that can start a fight.
 *   2  Needs candour, or says something about the relationship rather than about you.
 *      Fine inside a fortnight.
 *   3  Exposing, or able to open a wound. Dealbreakers, what you have not said out
 *      loud, the hardest thing to ask for. Earned, never early.
 *
 * Kept off the database deliberately. Postgres stores only what it needs to score —
 * facet kinds and option ids — and intensity is an ordering concern, so putting it
 * there would be a second copy to keep in step for no gain.
 */
export type Intensity = 1 | 2 | 3

export interface Question {
  /** Stable forever. Never reused, never renumbered — answers reference it. */
  id: string
  category: Category
  intensity: Intensity
  /** The headline, set in the display serif. The frame; facets are the answer. */
  prompt: string
  facets: Facet[]
  /**
   * Whether this question is worth asking twice.
   *
   * State questions renew — how you slept, how full the week is, where money
   * sits. Ask them in a year and the answer has moved.
   *
   * Trait questions don't. Your chronotype, what helps when you're upset, the
   * hardest thing to ask for: one enduring answer. Once it's been asked, both
   * partners have *seen each other's answer at the reveal*, so asking again
   * scores full marks from memory. Scores would climb across the second pass for
   * no reason connected to the couple, and once accuracy pays out, tender would
   * inflate with them.
   *
   * So the rotation only recycles renewable questions. Trait questions are asked
   * once, and the fix for running dry is more questions, not repeats.
   */
  renewable: boolean
}

/**
 * One person's submission for one facet:
 *   choice → the chosen option's id
 *   scale  → an integer 0-100
 */
export type FacetValue = string | number

/** Keyed by facet id. */
export type AnswerPayload = Record<string, FacetValue>
