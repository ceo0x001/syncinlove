'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { destroyLetter, openLetter, sealLetter } from '@/app/actions'
import { Button, Card, Notice, TextField } from './ui'

/**
 * The letter vault.
 *
 * A sealed letter is a message that cannot be recalled, arriving on a date chosen
 * months earlier. In a relationship that has ended that is merely sad; in one
 * that has gone wrong it is a scheduled contact from somebody the recipient may
 * be trying to get away from.
 *
 * So the recipient's power to refuse is not buried in a settings screen. It sits
 * on every sealed letter, needs no reason, and the sender is never told which one
 * went — being told would turn the refusal itself into a message.
 */

/**
 * A sealed letter, as much of it as the recipient is allowed to know.
 *
 * Mirrors the columns of `sealed_for_me()` exactly, snake_case included, because
 * it arrives straight off PostgREST without a mapping layer. `unlock_on` and
 * `days_away` are both null when the sender chose to hide the date — that null
 * is the surprise working, not missing data.
 */
export interface SealedForMe {
  letter_id: string
  unlock_on: string | null
  days_away: number | null
}

export interface OpenLetter {
  id: string
  title: string
  body: string
  unlockOn: string
  opened: boolean
  fromMe: boolean
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function Vault({
  open,
  daysTogether,
  sealedForMe,
  letters,
  partnerFirstName,
  canSeal,
  today,
  minUnlockOn,
}: {
  open: boolean
  daysTogether: number
  sealedForMe: SealedForMe[]
  letters: OpenLetter[]
  partnerFirstName: string
  canSeal: boolean
  /**
   * Pair-local today, for deciding whether a letter's date has arrived.
   *
   * Server-computed in the pair's timezone for the same reason minUnlockOn is: the
   * letters policy compares against the pair's clock, so a card using the viewer's
   * own timezone would call a letter delivered hours before the database agreed.
   */
  today: string
  /**
   * Earliest selectable date, computed server-side in the PAIR's timezone.
   *
   * Passed in rather than derived from the browser clock: seal_letter validates
   * against pair-local today, so a picker using the viewer's own timezone would
   * offer dates the server then rejects.
   */
  minUnlockOn: string
}) {
  const [writing, setWriting] = useState(false)

  if (!open) {
    return (
      <Notice>
        The vault opens after 30 days together — you’re at {daysTogether}. It
        counts days you both answered, not days in a row, so a missed day only
        slows it down.
      </Notice>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '2rem' }}>
      {sealedForMe.length > 0 ? (
        <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
          <p className="t-label">Waiting for you</p>
          {sealedForMe.map((letter) => (
            <SealedRow key={letter.letter_id} letter={letter} from={partnerFirstName} />
          ))}
        </div>
      ) : null}

      {letters.length > 0 ? (
        <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
          <p className="t-label">Open</p>
          {letters.map((letter) => (
            <LetterCard
              key={letter.id}
              letter={letter}
              from={partnerFirstName}
              today={today}
            />
          ))}
        </div>
      ) : null}

      {writing ? (
        <SealForm
          partnerFirstName={partnerFirstName}
          minUnlockOn={minUnlockOn}
          onDone={() => setWriting(false)}
        />
      ) : canSeal ? (
        <Button onClick={() => setWriting(true)}>Write a letter</Button>
      ) : (
        <Notice>
          Confirm your email before sealing a letter. It can’t be unsealed early or
          taken back, so the account doing it should be one you can prove is yours.
        </Notice>
      )}
    </div>
  )
}

/**
 * When it opens, in the words somebody would actually use.
 *
 * A bare date makes the reader do the arithmetic, and the whole point of a
 * sealed letter is anticipation — "in 3 days" carries that and "Opens 14 Aug"
 * does not. The date comes along past a week out, where the countdown stops
 * meaning anything and a date is the more useful of the two.
 *
 * Today and negative are both possible: the date can arrive between the page
 * rendering and the reader looking at it, and the letters policy uses the pair's
 * timezone rather than the viewer's, so a few hours of disagreement is normal.
 * Both say the same thing, which is that it is ready now.
 */
function opensWhen(letter: SealedForMe): string {
  if (letter.unlock_on === null) return 'They chose not to tell you when it opens'

  const days = letter.days_away
  if (days === null) return `Opens ${formatDate(letter.unlock_on)}`
  if (days <= 0) return 'Opens today'
  if (days === 1) return 'Opens tomorrow'
  if (days <= 7) return `Opens in ${days} days`
  return `Opens in ${days} days · ${formatDate(letter.unlock_on)}`
}

function SealedRow({ letter, from }: { letter: SealedForMe; from: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 block size-3.5 shrink-0 rounded-full bg-sealed" />
        <div className="min-w-0">
          <p className="t-title text-ink">A letter from {from}</p>
          <p className="t-small mt-1 text-ink-muted">{opensWhen(letter)}</p>
        </div>
      </div>

      <div className="mt-3 border-t border-hairline pt-3">
        {confirming ? (
          <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
            <p className="t-small text-ink">
              Destroy it without reading it? {from} won’t be told which letter went.
              This can’t be undone.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await destroyLetter(letter.letter_id)
                    if (result?.error) setError(result.error)
                  })
                }
                className="t-small font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current disabled:opacity-40"
              >
                {pending ? 'Destroying…' : 'Yes, destroy it'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="t-small text-ink-muted underline decoration-hairline underline-offset-4 hover:text-ink"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          /* Deliberately here, on the letter, and not in a settings screen. */
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="t-small text-ink-faint underline decoration-hairline underline-offset-4 hover:text-ink-muted"
          >
            I don’t want this letter
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </div>
  )
}

/**
 * What a letter says about itself.
 *
 * For a letter you RECEIVED this is just who it is from and when it opened.
 *
 * For one you WROTE it now reports whether it has been read, which it did not
 * before — and that gap was a real inconsistency rather than a missing nicety. The
 * letter_opened notification already emails the sender the moment their letter is
 * read, so somebody would get told by email and then find the vault silent on it.
 * Worse for anybody who has letter emails switched off: the app knew and never
 * said.
 *
 * It discloses nothing the notification does not. The one thing that stays
 * deliberately unsaid is refusal: a destroyed letter is hard-deleted, so it simply
 * stops appearing here, and there is no state for "they refused this". That the
 * absence of a row is itself inferable by an attentive sender is a property of the
 * hard delete, not of this label.
 */
function senderStatus(letter: OpenLetter, today: string): string {
  // ISO dates compare correctly as strings, which is why unlock_on is carried
  // around as a plain 'YYYY-MM-DD' rather than parsed into a Date here.
  if (letter.unlockOn > today) return `Sealed until ${formatDate(letter.unlockOn)}`
  if (letter.opened) return 'They opened it'
  return 'Waiting to be opened'
}

function LetterCard({
  letter,
  from,
  today,
}: {
  letter: OpenLetter
  from: string
  today: string
}) {
  const [showing, setShowing] = useState(letter.opened || letter.fromMe)
  const [pending, startTransition] = useTransition()

  return (
    <Card>
      <p className="t-label mb-2">
        {letter.fromMe
          ? `You wrote this · ${senderStatus(letter, today)}`
          : `From ${from} · ${formatDate(letter.unlockOn)}`}
      </p>
      <p className="t-title text-ink">{letter.title}</p>

      {showing ? (
        <p className="t-body mt-3 whitespace-pre-wrap text-ink-muted">{letter.body}</p>
      ) : (
        <div className="mt-3">
          <Button
            variant="quiet"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await openLetter(letter.id)
                setShowing(true)
              })
            }
          >
            {pending ? 'Opening…' : 'Open it'}
          </Button>
        </div>
      )}
    </Card>
  )
}

function SealForm({
  partnerFirstName,
  minUnlockOn,
  onDone,
}: {
  partnerFirstName: string
  minUnlockOn: string
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(sealLetter, null)
  const [visible, setVisible] = useState(true)

  // Close only once it actually sealed, and never during render — calling a
  // parent's setState mid-paint is a different bug wearing this one's clothes.
  useEffect(() => {
    if (!state?.ok) return
    const timer = window.setTimeout(onDone, 0)
    return () => window.clearTimeout(timer)
  }, [state?.ok, onDone])

  return (
    <form
      action={formAction}
      className="stack rounded-[0.875rem] border border-accent bg-paper-raised p-5"
      style={{ ['--stack-gap' as string]: '1.25rem' }}
    >
      <div>
        <p className="t-title text-ink">A letter to {partnerFirstName}</p>
        <p className="t-small mt-1 text-ink-muted">
          Sealed until the date you pick. You won’t be able to edit it or take it
          back, and they can refuse it without reading it.
        </p>
      </div>

      <TextField label="Title" name="title" maxLength={80} required autoFocus
        hint="They see this while it's still sealed." />

      <label className="block">
        <span className="t-label mb-2 block">The letter</span>
        <textarea
          name="body"
          required
          rows={9}
          maxLength={8000}
          className="w-full resize-y rounded-[0.625rem] border border-hairline bg-paper px-4 py-3.5 text-base leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </label>

      <TextField label="Opens on" name="unlockOn" type="date" min={minUnlockOn} required
        hint="An anniversary, a birthday, the day a flight lands." />

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="dateVisible"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
          className="mt-0.5 size-[1.125rem] shrink-0 accent-[var(--accent)]"
        />
        <span className="t-body text-ink-muted">
          Let {partnerFirstName} see the date.{' '}
          <span className="text-ink-faint">
            {visible
              ? 'They’ll have something to look forward to.'
              : 'They’ll know a letter exists, and nothing else.'}
          </span>
        </span>
      </label>

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

      <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
        <Button type="submit" disabled={pending}>
          {pending ? 'Sealing…' : 'Seal it'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
