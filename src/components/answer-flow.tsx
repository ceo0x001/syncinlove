'use client'

import { useActionState, useMemo, useState } from 'react'
import { submitAnswer } from '@/app/actions'
import { withPartnerName } from '@/lib/questions/bank'
import type { AnswerPayload, Question } from '@/lib/questions/types'
import { ChoiceInput, ScaleInput } from './facet-inputs'
import { Button, Notice } from './ui'

/**
 * Answer, then guess.
 *
 * Two discrete steps rather than one interleaved form. Answering honestly and
 * predicting somebody else are different mental modes, and mixing them on one
 * screen makes both worse — you start shading your own answer toward the one
 * you're about to guess.
 */

type Step = 'self' | 'guess'

export function AnswerFlow({
  question,
  dayIndex,
  partnerFirstName,
  partnerAnswered,
  isGrace,
}: {
  question: Question
  dayIndex: number
  partnerFirstName: string | null
  partnerAnswered: boolean
  isGrace: boolean
}) {
  const [step, setStep] = useState<Step>('self')
  const [self, setSelf] = useState<AnswerPayload>(() => initialPayload(question))
  const [guess, setGuess] = useState<AnswerPayload>(() => initialPayload(question))
  const [state, formAction, pending] = useActionState(submitAnswer, null)

  const current = step === 'self' ? self : guess
  const setCurrent = step === 'self' ? setSelf : setGuess

  // Choices carry no default, so a step isn't done until each has been picked.
  const stepComplete = useMemo(
    () =>
      question.facets.every(
        (facet) => facet.kind !== 'choice' || typeof current[facet.id] === 'string',
      ),
    [question.facets, current],
  )

  // Before the partner joins there is no name to use, and a bare "them" reads as
  // broken English in subject position ("what will them have said?"). Two
  // fallbacks so the copy stays grammatical wherever it lands, including at the
  // start of a sentence.
  const them = partnerFirstName?.trim() || 'your partner'
  const Them = partnerFirstName?.trim() || 'Your partner'

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '2rem' }}>
      <header className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <div className="flex items-center justify-between gap-4">
          <span className="t-label">
            {step === 'self' ? 'About you' : `About ${them}`}
          </span>
          <StepDots step={step} />
        </div>

        <h1 className="t-question text-ink">{question.prompt}</h1>

        {step === 'guess' ? (
          <p className="t-body text-ink-muted">
            Now the other half — what will {them} have said?
          </p>
        ) : null}

        {isGrace && step === 'self' ? (
          <Notice>
            This is yesterday’s question, still open for a few more hours. Answer it
            and the day still counts.
          </Notice>
        ) : null}
      </header>

      {/* Keyed so switching steps remounts the inputs — otherwise a slider keeps
          its previous thumb position and looks pre-answered. */}
      <div
        key={step}
        className="stack animate-rise"
        style={{ ['--stack-gap' as string]: '2.25rem' }}
      >
        {question.facets.map((facet) => {
          const prompt = withPartnerName(
            step === 'self' ? facet.ask : facet.askAbout,
            partnerFirstName,
          )

          if (facet.kind === 'choice') {
            return (
              <ChoiceInput
                key={facet.id}
                facet={facet}
                prompt={prompt}
                value={current[facet.id]}
                onChange={(value) => setCurrent({ ...current, [facet.id]: value })}
              />
            )
          }

          return (
            <ScaleInput
              key={facet.id}
              facet={facet}
              prompt={prompt}
              value={Number(current[facet.id] ?? 50)}
              onChange={(value) => setCurrent({ ...current, [facet.id]: value })}
            />
          )
        })}
      </div>

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

      {step === 'self' ? (
        <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
          <Button type="button" disabled={!stepComplete} onClick={() => setStep('guess')}>
            Next — guess {them}
          </Button>
          {partnerAnswered ? (
            <p className="t-small text-center text-ink-muted">
              {Them} has already answered.
            </p>
          ) : null}
        </div>
      ) : (
        <form action={formAction} className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
          <input type="hidden" name="dayIndex" value={dayIndex} />
          <input type="hidden" name="self" value={JSON.stringify(self)} />
          <input type="hidden" name="guess" value={JSON.stringify(guess)} />

          <Button type="submit" disabled={!stepComplete || pending}>
            {pending ? 'Sealing…' : 'Seal both answers'}
          </Button>

          <Button type="button" variant="ghost" onClick={() => setStep('self')} disabled={pending}>
            Back to your own answer
          </Button>

          <p className="t-small text-center text-ink-faint">
            You can’t change these once they’re in.
          </p>
        </form>
      )}
    </div>
  )
}

function StepDots({ step }: { step: Step }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={step === 'self' ? 'Step 1 of 2' : 'Step 2 of 2'}>
      <Dot filled />
      <Dot filled={step === 'guess'} />
    </span>
  )
}

function Dot({ filled }: { filled?: boolean }) {
  return (
    <span
      aria-hidden
      className={`size-1.5 rounded-full transition-colors duration-300 ${
        filled ? 'bg-accent' : 'bg-hairline-strong'
      }`}
    />
  )
}

/** Scales start centred; choices start empty so nothing is answered by default. */
function initialPayload(question: Question): AnswerPayload {
  const payload: AnswerPayload = {}
  for (const facet of question.facets) {
    if (facet.kind === 'scale') payload[facet.id] = 50
  }
  return payload
}
