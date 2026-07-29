import type { Question } from '@/lib/questions/types'
import { withPartnerName } from '@/lib/questions/bank'

/**
 * The shape of the reveal, with the other side still sealed.
 *
 * This exists because of the single most likely way this app dies: somebody
 * answers, hits the invite wall, and their partner never comes. If that person's
 * first session ends at a blank "waiting…" screen, they have spent their whole
 * first visit earning nothing and seeing nothing.
 *
 * So they get the real layout, in the real typography, with their own answers
 * present and the partner's side drawn as sealed panels. They leave having seen
 * exactly what they are waiting for.
 */
export function SealedPreview({
  question,
  partnerFirstName,
}: {
  question: Question
  partnerFirstName: string | null
}) {
  // Has to agree with a singular verb ("…the moment X answers"), so the fallback
  // is a noun phrase rather than the bare pronoun "they".
  const them = partnerFirstName?.trim() || 'your person'

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
      <div className="rounded-[0.875rem] border border-hairline bg-paper-raised px-5 py-7 text-center">
        <p className="t-label mb-4">Today, together</p>

        <p className="t-display select-none text-sealed" aria-hidden>
          ••
        </p>

        <p className="t-body mx-auto mt-4 max-w-[18rem] text-ink-muted">
          Your score appears the moment {them} answers. Neither of you sees anything
          before then.
        </p>
      </div>

      {question.facets.map((facet) => (
        <div
          key={facet.id}
          className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4"
        >
          <p className="t-label mb-3">{withPartnerName(facet.ask, partnerFirstName)}</p>

          <div className="flex items-center gap-3">
            <span className="t-small shrink-0 text-ink-muted">Your answer</span>
            <span className="h-px flex-1 bg-hairline" />
            <span className="t-small text-ink-faint">in</span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="t-small shrink-0 text-ink-faint">
              {partnerFirstName ?? 'Their'}
              {partnerFirstName ? '’s answer' : ' answer'}
            </span>
            <span className="h-px flex-1 bg-hairline" />
            <span
              aria-hidden
              className="block h-3.5 w-8 rounded-full bg-sealed"
              title="Sealed"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
