import type { AnswerPayload, Question } from './types'
import { clampScale } from '@/lib/sync/score'

/**
 * Payload validation, run again on the server for every submission.
 *
 * The client already constrains these inputs, which is exactly why this exists:
 * a submission is immutable once accepted and feeds a score that pays out, so
 * the one place that must not trust the client is the one place the client
 * writes to.
 */

export type ValidationResult =
  | { ok: true; value: AnswerPayload }
  | { ok: false; error: string }

export function validatePayload(question: Question, raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Answer must be an object.' }
  }

  const input = raw as Record<string, unknown>
  const value: AnswerPayload = {}

  for (const facet of question.facets) {
    const given = input[facet.id]

    if (given === undefined || given === null || given === '') {
      return { ok: false, error: `Missing answer for "${facet.id}".` }
    }

    if (facet.kind === 'choice') {
      if (typeof given !== 'string') {
        return { ok: false, error: `"${facet.id}" must be an option id.` }
      }
      if (!facet.options.some((o) => o.id === given)) {
        return { ok: false, error: `"${given}" is not an option for "${facet.id}".` }
      }
      value[facet.id] = given
      continue
    }

    const n = typeof given === 'number' ? given : Number(given)
    if (!Number.isFinite(n)) {
      return { ok: false, error: `"${facet.id}" must be a number.` }
    }
    value[facet.id] = clampScale(n)
  }

  // Unknown keys are dropped rather than rejected, so adding a facet to a
  // question later can't be exploited by replaying an old shape, and a stale
  // client tab can't be locked out mid-submission.
  return { ok: true, value }
}
