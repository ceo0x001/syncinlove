'use client'

import { describePosition } from '@/lib/questions/scale-words'
import type { ChoiceFacet, FacetValue, ScaleFacet } from '@/lib/questions/types'

/**
 * The two input kinds.
 *
 * The slider shows no number. A readout turns the question into a test — you
 * start optimising the digits instead of answering. The two anchor labels and
 * the thumb position carry it, and the reveal is where the distance becomes
 * visible, drawn as two marks on one track rather than as arithmetic.
 *
 * Choices have no default. A pre-selected option is an answer nobody gave, and
 * it would quietly feed a score that pays out.
 */

export function ChoiceInput({
  facet,
  prompt,
  value,
  onChange,
}: {
  facet: ChoiceFacet
  prompt: string
  value: FacetValue | undefined
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="t-title mb-3 block text-ink">{prompt}</legend>
      <div className="flex flex-col gap-2">
        {facet.options.map((option) => {
          const selected = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
              className={
                'flex min-h-[3.25rem] items-center rounded-[0.625rem] border px-4 py-3 text-left ' +
                'text-[0.9375rem] leading-snug tracking-[-0.005em] transition-all duration-150 ' +
                'active:scale-[0.99] ' +
                (selected
                  ? 'border-accent bg-accent-wash text-ink'
                  : 'border-hairline bg-paper-raised text-ink-muted hover:border-hairline-strong hover:text-ink')
              }
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function ScaleInput({
  facet,
  prompt,
  value,
  onChange,
}: {
  facet: ScaleFacet
  prompt: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <label className="t-title mb-4 block text-ink" htmlFor={`scale-${facet.id}`}>
        {prompt}
      </label>

      <input
        id={`scale-${facet.id}`}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={describePosition(value, facet)}
        className="sync-range w-full"
        style={{ ['--fill' as string]: `${value}%` }}
      />

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <span className="t-small text-ink-muted">{facet.minLabel}</span>
        <span className="t-small text-right text-ink-muted">{facet.maxLabel}</span>
      </div>
    </div>
  )
}
