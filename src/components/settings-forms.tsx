'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  burnEverything,
  endPairing,
  exportArchive,
  revokeClaim,
  signOutSession,
  setPace,
  updateNotifyPrefs,
  updateProfile,
} from '@/app/actions'
import { haptic } from '@/lib/haptics'
import type { Me } from '@/lib/session'
import { Button, Notice, TextField } from './ui'

/**
 * Identity, and the exits.
 *
 * The two destructive actions live at the bottom, behind their own confirmations,
 * and neither is disguised as something gentler. A person deciding to leave
 * should find the door clearly marked rather than have to hunt for it — and
 * should not be able to walk through it by mistake.
 */

/** Matches the database constraint. Changing one means changing both. */
const ALIAS_MAX = 24

export function ProfileForm({ me }: { me: Me }) {
  const [state, formAction, pending] = useActionState(updateProfile, null)
  const [display, setDisplay] = useState(me.listDisplay)
  const [optIn, setOptIn] = useState(me.listOptIn)
  const [alias, setAlias] = useState(me.listAlias ?? '')

  /**
   * Mirrors the two rules the database enforces, so the answer arrives while
   * they're typing rather than after a round trip.
   *
   * The letter rule exists because this is the only text this app shows to
   * strangers, and a leaderboard displaying somebody's phone number is not a
   * thing to leave to chance. It stops digits-only, not digits.
   */
  const aliasProblem =
    display !== 'alias'
      ? null
      : alias.trim().length > ALIAS_MAX
        ? `That's ${alias.trim().length} characters — ${ALIAS_MAX} is the most that fits.`
        : alias.trim().length > 0 && !/[a-z]/i.test(alias)
          ? 'Give it at least one letter — numbers on their own aren’t a name.'
          : null

  const initial = (me.firstName ?? '?').trim().charAt(0).toUpperCase()

  return (
    <form action={formAction} className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
      <TextField
        label="Your name"
        name="firstName"
        defaultValue={me.firstName ?? ''}
        maxLength={40}
        required
        hint="What the app calls you and what your partner sees. A pet name is fine."
      />

      <fieldset className="border-0 p-0">
        <legend className="t-label mb-1 block">The Rich List</legend>
        <p className="t-small mb-3 text-ink-muted">
          A public list showing two real first names tells everyone those two people
          are a couple. So it&rsquo;s off unless you say otherwise, and it takes both
          of you — either one of you withdrawing takes the couple off it.
        </p>

        <label
          className={
            'mb-3 flex min-h-[3rem] cursor-pointer items-start gap-3 rounded-[0.625rem] border px-4 py-3 ' +
            (optIn ? 'border-accent bg-accent-wash' : 'border-hairline bg-paper-raised')
          }
        >
          <input
            type="checkbox"
            name="listOptIn"
            checked={optIn}
            onChange={(event) => setOptIn(event.target.checked)}
            className="mt-0.5 size-[1.125rem] shrink-0 accent-[var(--accent)]"
          />
          <span>
            <span className="t-body block text-ink">Put us on the Rich List</span>
            <span className="t-small text-ink-muted">
              Ranked on tender earned, never held — spending on each other costs
              you nothing.
            </span>
          </span>
        </label>

        {/* Shown regardless of the checkbox: deciding how you'd be printed
            before agreeing to be printed is the right order. */}
        <p className="t-label mb-2 block">Shown as</p>
        <div className="flex flex-col gap-2">
          {(
            [
              ['initial', `Just my initial — ${initial}`],
              ['name', `My name — ${me.firstName ?? ''}`],
              ['alias', 'Something else entirely'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={
                'flex min-h-[3rem] cursor-pointer items-center gap-3 rounded-[0.625rem] border px-4 py-3 ' +
                (display === value
                  ? 'border-accent bg-accent-wash'
                  : 'border-hairline bg-paper-raised')
              }
            >
              <input
                type="radio"
                name="listDisplay"
                value={value}
                checked={display === value}
                onChange={() => setDisplay(value)}
                className="size-[1.125rem] shrink-0 accent-[var(--accent)]"
              />
              <span className="t-body text-ink">{label}</span>
            </label>
          ))}
        </div>

        {display === 'alias' ? (
          <div className="mt-3">
            {/* No maxLength. Capping the field silently swallowed the 25th
                keystroke, so a long alias just stopped typing with no
                explanation — the field looked broken rather than full. It now
                accepts the overrun and says what the limit is. */}
            <TextField
              label="Shown instead"
              name="listAlias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="hot sauce"
              hint={
                aliasProblem ??
                `${alias.trim().length}/${ALIAS_MAX} characters. Shown publicly, so pick something you'd say out loud.`
              }
            />
            {aliasProblem ? (
              <p className="t-small mt-2 text-[var(--error)]">{aliasProblem}</p>
            ) : null}
          </div>
        ) : (
          <input type="hidden" name="listAlias" value={me.listAlias ?? ''} />
        )}
      </fieldset>

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice>Saved.</Notice> : null}

      <Button type="submit" disabled={pending || Boolean(aliasProblem)}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}

/**
 * Signing out of this browser.
 *
 * Two different actions wearing one label, and the difference is the whole point.
 *
 * With a confirmed address this is routine: sign out here, sign back in there with
 * an emailed code. Nothing is at stake, so it is one click.
 *
 * Without one, the session cookie in this browser is the only thing that proves
 * the account is yours. Signing out does not delete anything — it abandons it,
 * with the streak and the answers still sitting there unreachable. Somebody lost
 * an account exactly that way, so that version asks a second time and says plainly
 * what it costs. It is deliberately the slower of the two paths.
 */
export function SignOutForm({ secured }: { secured: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go() {
    startTransition(async () => {
      const result = await signOutSession()
      if (result.error) {
        setError(result.error)
        return
      }
      // A full load, not a client transition: everything cached in this tab
      // belongs to the session that just ended.
      window.location.href = '/'
    })
  }

  if (secured) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
        <Button variant="quiet" disabled={pending} onClick={go}>
          {pending ? 'Signing you out…' : 'Sign out'}
        </Button>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    )
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="t-small text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
      >
        Sign out of this browser
      </button>
    )
  }

  return (
    <div
      className="stack rounded-[0.875rem] border border-hairline bg-paper-raised p-5"
      style={{ ['--stack-gap' as string]: '1.25rem' }}
    >
      <div>
        <p className="t-title text-ink">You won’t be able to get back in.</p>
        <p className="t-small mt-1 text-ink-muted">
          This account has no confirmed email, so this browser is the only proof
          it’s yours. Signing out doesn’t delete anything — your streak, answers
          and tender stay exactly where they are, and nobody will ever reach them
          again. Confirm the code above first and this becomes undoable.
        </p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
        <Button variant="quiet" disabled={pending} onClick={go}>
          {pending ? 'Signing you out…' : 'Sign out and lose this account'}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setConfirming(false)
            setError(null)
          }}
        >
          Keep me signed in
        </Button>
      </div>
    </div>
  )
}

/** Downloads the whole archive as JSON. */
export function ExportButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
      <Button
        variant="quiet"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await exportArchive()
            if (result.error || !result.data) {
              setError(result.error ?? 'Could not build the export.')
              return
            }
            const blob = new Blob([result.data], { type: 'application/json' })
            const href = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = href
            link.download = 'syncinlove-archive.json'
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(href)
          })
        }
      >
        {pending ? 'Gathering it…' : 'Download everything'}
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  )
}

/**
 * Ending the pairing.
 *
 * Burn is preselected for the sealed letters. A love letter arriving three weeks
 * after a split is a cruel thing to have built, so the kind option must be the
 * default rather than the one you have to find.
 */
/**
 * Undoing a wrong claim.
 *
 * The narrow case this exists for: you sent a link, the wrong person opened it, and
 * you want them out along with anything they submitted. Within 24 hours of their
 * claim, and only for the person who sent the link.
 *
 * It lived on the dashboard as a single unconfirmed button, which is how a real
 * couple lost their history — `canRevoke` is only "within 24 hours", so it sat there
 * during the ordinary first day of every healthy pairing.
 *
 * Two things it now does that it did not before. It asks. And it says what it takes,
 * item by item, rather than "you can undo it" — because the destruction is much
 * wider than the word undo suggests: every reveal for the pairing, both partners'
 * entire tender balance, every purchase, and the joiner's answers and menu. All hard
 * deletes, no backup, nothing to reconstruct from.
 *
 * Deliberately worded to send the common case away. Anybody reaching Settings for
 * this is far more likely to have the right partner and a wrong impression of the
 * button than to have an impostor in their pairing.
 */
/**
 * Discarding a pairing nobody joined.
 *
 * The dead end this closes: claim_invite refuses a second pairing, and the refusal
 * says to end the current one in Settings first — but Settings only ever offered
 * that when a partner existed. Somebody holding a solo pairing was told to do
 * something the app would not let them do, and the loop had no exit.
 *
 * It is reachable exactly when nobody has joined, so there is no shared history to
 * weigh and nobody on the other side to consider. Confirmed once anyway, because it
 * does discard whatever you answered while waiting, and because a one-tap
 * destructive button is the mistake this app already made once today.
 *
 * Letters are passed as 'keep'. A solo pairing cannot have a sealed letter — there
 * was never a recipient — so the choice is moot, and 'keep' is the option that
 * deletes nothing if that assumption is ever wrong.
 */
export function DiscardPairingForm() {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="t-small text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
      >
        Start over with a different pairing
      </button>
    )
  }

  return (
    <div
      className="stack rounded-[0.875rem] border border-hairline bg-paper-raised p-5"
      style={{ ['--stack-gap' as string]: '1.25rem' }}
    >
      <div>
        <p className="t-title text-ink">Let this pairing go?</p>
        <p className="t-small mt-1 text-ink-muted">
          Nobody joined it, so there is nothing shared to lose. Anything you answered
          while waiting goes with it, and your invite link stops working.
        </p>
        <p className="t-small mt-2 text-ink-muted">
          Do this if you were invited by somebody and need to accept their link
          instead &mdash; afterwards, open their link again and it will let you in.
        </p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await endPairing('keep')
              if (result?.error) {
                setError(result.error)
                haptic('error')
                return
              }
              haptic('commit')
            })
          }
          className="t-small font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current disabled:opacity-40"
        >
          {pending ? 'Letting it go…' : 'Yes, let it go'}
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
  )
}

export function RevokeClaimForm({ partnerFirstName }: { partnerFirstName: string }) {
  const [stage, setStage] = useState<'closed' | 'open' | 'sure'>('closed')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (stage === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setStage('open')}
        className="t-small text-ink-faint underline decoration-hairline underline-offset-4 hover:text-ink-muted"
      >
        Somebody else used my invite link
      </button>
    )
  }

  return (
    <div
      className="stack rounded-[0.875rem] border border-hairline bg-paper-raised p-5"
      style={{ ['--stack-gap' as string]: '1.25rem' }}
    >
      <div>
        <p className="t-title text-ink">Remove {partnerFirstName} from this pairing?</p>
        <p className="t-small mt-1 text-ink-muted">
          Only do this if {partnerFirstName} is <em>not</em> the person you meant to
          invite. If they are your partner, close this — what you want is somewhere
          else, or nowhere.
        </p>
      </div>

      <div className="rounded-[0.625rem] border border-accent/35 bg-accent-wash p-4">
        <p className="t-label mb-2 text-ink">This deletes, permanently</p>
        <ul className="stack" style={{ ['--stack-gap' as string]: '0.375rem' }}>
          {[
            'Every reveal you two have had — so the whole history, and the streak',
            'Everything ' + partnerFirstName + ' has answered',
            'All tender, for both of you, and every request either of you made',
            partnerFirstName + '’s menu',
          ].map((line) => (
            <li key={line} className="t-small flex gap-2 text-ink-muted">
              <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="t-small mt-3 text-ink">
          There is no undo and no backup. Your own answers, your own menu and your
          sealed letters stay.
        </p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {stage === 'open' ? (
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => setStage('sure')}
            className="t-small font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current"
          >
            I understand — continue
          </button>
          <button
            type="button"
            onClick={() => setStage('closed')}
            className="t-small text-ink-muted underline decoration-hairline underline-offset-4 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
          <p className="t-small text-ink">
            Last check. Removing {partnerFirstName} destroys the list above and cannot
            be reversed.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeClaim()
                  if (result?.error) {
                    setError(result.error)
                    haptic('error')
                    return
                  }
                  haptic('commit')
                })
              }
              className="t-small font-medium text-accent underline decoration-transparent underline-offset-4 hover:decoration-current disabled:opacity-40"
            >
              {pending ? 'Removing…' : `Yes, remove ${partnerFirstName} and delete it all`}
            </button>
            <button
              type="button"
              onClick={() => setStage('closed')}
              className="t-small text-ink-muted underline decoration-hairline underline-offset-4 hover:text-ink"
            >
              Keep everything
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function EndPairingForm({ partnerFirstName }: { partnerFirstName: string }) {
  const [stage, setStage] = useState<'closed' | 'open'>('closed')
  const [letters, setLetters] = useState<'burn' | 'keep'>('burn')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (stage === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setStage('open')}
        className="t-small text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
      >
        End the pairing with {partnerFirstName}
      </button>
    )
  }

  return (
    <div className="stack rounded-[0.875rem] border border-hairline bg-paper-raised p-5"
      style={{ ['--stack-gap' as string]: '1.25rem' }}>
      <div>
        <p className="t-title text-ink">End it with {partnerFirstName}?</p>
        <p className="t-small mt-1 text-ink-muted">
          Your history stays readable to you both — nothing either of you already
          saw is taken away. Any outstanding request is refunded. You can each pair
          with somebody new afterwards.
        </p>
      </div>

      <fieldset className="border-0 p-0">
        <legend className="t-label mb-2 block">Sealed letters, not yet opened</legend>
        <div className="flex flex-col gap-2">
          {(
            [
              ['burn', 'Destroy them', 'Neither of you receives anything you wrote for a future that isn’t coming.'],
              ['keep', 'Leave them sealed', 'They stay in the vault. They still won’t open for anyone unpaired.'],
            ] as const
          ).map(([value, label, detail]) => (
            <label
              key={value}
              className={
                'cursor-pointer rounded-[0.625rem] border px-4 py-3 ' +
                (letters === value
                  ? 'border-accent bg-accent-wash'
                  : 'border-hairline bg-paper')
              }
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  checked={letters === value}
                  onChange={() => setLetters(value)}
                  className="size-[1.125rem] shrink-0 accent-[var(--accent)]"
                />
                <span className="t-body text-ink">{label}</span>
              </span>
              <span className="t-small mt-1 block pl-8 text-ink-muted">{detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await endPairing(letters)
              if (result?.error) setError(result.error)
              else window.location.assign('/')
            })
          }
        >
          {pending ? 'Ending…' : `End it${letters === 'burn' ? ' and destroy the letters' : ''}`}
        </Button>
        <Button variant="ghost" onClick={() => setStage('closed')} disabled={pending}>
          Not now
        </Button>
      </div>
    </div>
  )
}

/** Burn everything. Typed confirmation, because a button alone is too easy. */
export function BurnForm({ canBurn }: { canBurn: boolean }) {
  const [stage, setStage] = useState<'closed' | 'open'>('closed')
  const [typed, setTyped] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (stage === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setStage('open')}
        className="t-small text-ink-faint underline decoration-hairline underline-offset-4 hover:text-ink-muted"
      >
        Delete my account and everything I wrote
      </button>
    )
  }

  return (
    <div className="stack rounded-[0.875rem] border border-hairline bg-paper-raised p-5"
      style={{ ['--stack-gap' as string]: '1.25rem' }}>
      <div>
        <p className="t-title text-ink">This cannot be undone.</p>
        <p className="t-small mt-1 text-ink-muted">
          Your account, your answers, your menu, your tender and every letter you
          wrote are deleted outright. Sealed letters addressed to you go too.
        </p>
        <p className="t-small mt-2 text-ink-muted">
          What stays is what your partner wrote. Shared history is jointly
          authored, so it isn&rsquo;t yours alone to erase. Consider{' '}
          <strong className="text-ink">downloading everything</strong> first —
          afterwards there is nothing to download.
        </p>
        <p className="t-small mt-2 text-ink-faint">
          Removed immediately; encrypted backups purge within 30 days.
        </p>
      </div>

      {canBurn ? (
        <TextField
          label="Type BURN to confirm"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
        />
      ) : (
        <Notice>
          Confirm your email first. Something with no undo shouldn&rsquo;t be
          available to an account nobody can prove is yours.
        </Notice>
      )}

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
        <Button
          disabled={pending || !canBurn || typed.trim().toUpperCase() !== 'BURN'}
          onClick={() =>
            startTransition(async () => {
              const result = await burnEverything(typed)
              if (result?.error) setError(result.error)
              else window.location.assign('/')
            })
          }
        >
          {pending ? 'Deleting…' : 'Delete everything'}
        </Button>
        <Button variant="ghost" onClick={() => setStage('closed')} disabled={pending}>
          Keep my account
        </Button>
      </div>
    </div>
  )
}

/**
 * Which nudges to send.
 *
 * Three switches, not one. All-or-nothing makes people kill the lot because one
 * of them irritated them, and the one that irritates is rarely the one that
 * mattered — "your partner is waiting" is the whole point of the app, and
 * "somebody asked for something" is a promise you made to a person.
 *
 * All default on. Somebody who never opens this screen should still be told when
 * their partner is waiting.
 */
export function NotifyForm({ me }: { me: Me }) {
  const [state, formAction, pending] = useActionState(updateNotifyPrefs, null)

  const kinds = [
    {
      name: 'partner',
      on: me.notify.partner,
      label: 'When they’ve answered',
      detail: 'They’re waiting on you, and neither of you sees anything until you have.',
    },
    {
      name: 'reminders',
      on: me.notify.reminders,
      label: 'When the day’s about to close',
      detail: 'One in the evening, only if you haven’t answered. Nothing if you have.',
    },
    {
      name: 'requests',
      on: me.notify.requests,
      label: 'When something’s asked of you',
      detail: 'Somebody spent tender on your menu. No clock on it, but you should know.',
    },
    {
      name: 'letters',
      on: me.notify.letters,
      label: 'When a sealed letter opens',
      detail:
        'The day one becomes readable — and, if you sent one, the day they open it. Never that they didn’t.',
    },
  ] as const

  return (
    <form action={formAction} className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      <div>
        <p className="t-label mb-1 block">Emails</p>
        <p className="t-small mb-3 text-ink-muted">
          Only ever about your own pairing, at most one of each a day. Never
          anything either of you has written.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {kinds.map((kind) => (
          <label
            key={kind.name}
            className="press flex min-h-[3rem] cursor-pointer items-start gap-3 rounded-[0.625rem] border border-hairline bg-paper-raised px-4 py-3"
          >
            <input
              type="checkbox"
              name={kind.name}
              defaultChecked={kind.on}
              className="mt-0.5 size-[1.125rem] shrink-0 accent-[var(--accent)]"
            />
            <span>
              <span className="t-body block text-ink">{kind.label}</span>
              <span className="t-small text-ink-muted">{kind.detail}</span>
            </span>
          </label>
        ))}
      </div>

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice>Saved.</Notice> : null}

      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? 'Saving…' : 'Save email choices'}
      </Button>
    </form>
  )
}

/**
 * How fast the questions escalate.
 *
 * Exists because users asked for the axes to be "shuffled" — they wanted sex and the
 * future to turn up without waiting a month. Every pace now shows all eight axes in
 * the first fortnight, so this is not about which subjects you get. It is about how
 * quickly the asking gets harder.
 *
 * Framed as a choice rather than a default because the complaint was never unanimous:
 * some couples want the deep end sooner and others do not, and the same question
 * arrives for both partners at once. A setting is the honest answer to that; moving
 * everybody would just swap whose preference is ignored.
 *
 * No confirmation step, deliberately. It changes only what comes next, it is
 * reversible, and nothing already asked can move — so the cost of getting it wrong is
 * one question you did not expect.
 */
export function PaceForm({ pace }: { pace: 'gentle' | 'standard' | 'bold' }) {
  const [state, formAction, pending] = useActionState(setPace, null)

  const options = [
    {
      id: 'gentle',
      label: 'Gentle',
      detail: 'Easier questions for the first six weeks. The hard ones still come.',
    },
    {
      id: 'standard',
      label: 'Standard',
      detail: 'A steady climb. Most couples want this.',
    },
    {
      id: 'bold',
      label: 'Bold',
      detail: 'Straight into the deep end. Nothing is held back for long.',
    },
  ] as const

  return (
    <form action={formAction} className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      <div>
        <p className="t-label mb-1 block">Pace</p>
        <p className="t-small mb-3 text-ink-muted">
          Every pace asks about everything — all eight subjects turn up in your first
          fortnight. This is how fast they get harder. Either of you can change it, and
          it only affects questions you haven’t been asked yet.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            /*
              Highlighted from the radio, not from the saved value.

              This read `pace === option.id`, which meant the coral border stayed on
              whatever was saved while the radio dot moved to whatever you clicked —
              measured on screen: click Bold and the border was still on Standard. A
              control that shows two different answers at once is worse than one that
              shows none, and it only corrected itself after a save.

              The highlight lives in globals.css as `.pace-option:has(input:checked)`,
              so the radio decides and there is no second copy of the selection.
            */
            className={
              'pace-option flex cursor-pointer items-start gap-3 rounded-[0.625rem] ' +
              'border border-hairline bg-paper-raised px-4 py-3 ' +
              'transition-all duration-150 hover:border-hairline-strong'
            }
          >
            <input
              type="radio"
              name="pace"
              value={option.id}
              defaultChecked={pace === option.id}
              className="mt-1 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="t-body block text-ink">{option.label}</span>
              <span className="t-small block text-ink-muted">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice>Saved. It applies from your next question.</Notice> : null}

      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? 'Saving…' : 'Save pace'}
      </Button>
    </form>
  )
}
