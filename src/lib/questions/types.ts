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

export type Category = 'light' | 'logistics' | 'deep'

export interface ChoiceOption {
  /** Stable within the question. Answers store this, never the label, so a
   *  typo fix later doesn't silently rewrite somebody's history. */
  id: string
  label: string
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

export interface Question {
  /** Stable forever. Never reused, never renumbered — answers reference it. */
  id: string
  category: Category
  /** The headline, set in the display serif. The frame; facets are the answer. */
  prompt: string
  facets: Facet[]
}

/**
 * One person's submission for one facet:
 *   choice → the chosen option's id
 *   scale  → an integer 0-100
 */
export type FacetValue = string | number

/** Keyed by facet id. */
export type AnswerPayload = Record<string, FacetValue>
