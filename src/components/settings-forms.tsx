'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  burnEverything,
  endPairing,
  exportArchive,
  signOutSession,
  updateNotifyPrefs,
  updateProfile,
} from '@/app/actions'
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
