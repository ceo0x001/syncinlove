'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  burnEverything,
  endPairing,
  exportArchive,
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

export function ProfileForm({ me }: { me: Me }) {
  const [state, formAction, pending] = useActionState(updateProfile, null)
  const [display, setDisplay] = useState(me.listDisplay)

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
        <legend className="t-label mb-1 block">If you ever join the Rich List</legend>
        <p className="t-small mb-3 text-ink-muted">
          A public list showing two real first names tells everyone those two people
          are a couple. Your choice, not your partner&rsquo;s — and the list is
          opt-in for both of you regardless.
        </p>

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
            <TextField
              label="Shown instead"
              name="listAlias"
              defaultValue={me.listAlias ?? ''}
              maxLength={24}
              placeholder="hot sauce"
            />
          </div>
        ) : (
          <input type="hidden" name="listAlias" value={me.listAlias ?? ''} />
        )}
      </fieldset>

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice>Saved.</Notice> : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
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
