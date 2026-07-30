'use client'

import { useState, useTransition } from 'react'
import { adminDeleteAccount, adminSetAdmin } from '@/app/actions'
import type { AdminAccount } from '@/lib/session'
import { Button, Notice } from './ui'

/**
 * The account list.
 *
 * Deliberately metadata only — a name, an address, whether they can get back in,
 * how active they are. No answers, no menu items, no letters. Users are told
 * "neither of you sees anything until you both have" and "only you write this",
 * and this screen exists without making either of those untrue.
 *
 * Deleting asks twice, and says what it will and will not take. The guard lives
 * in the database: a pairing is only removed when nobody real is left in it, so
 * removing one half of a couple unpairs the other rather than erasing their
 * history along with it.
 */
export function AdminAccounts({ accounts }: { accounts: AdminAccount[] }) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function remove(userId: string) {
    setError(null)
    startTransition(async () => {
      const result = await adminDeleteAccount(userId)
      if (result.error) setError(result.error)
      else setConfirming(null)
    })
  }

  function toggleAdmin(userId: string, next: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await adminSetAdmin(userId, next)
      if (result.error) setError(result.error)
    })
  }

  if (accounts.length === 0) {
    return <Notice>No accounts match that search.</Notice>
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {accounts.map((account) => (
        <div
          key={account.userId}
          className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="t-title text-ink">
              {account.firstName ?? <span className="text-ink-faint">no name yet</span>}
              {account.isAdmin ? (
                <span className="t-label ml-2 rounded-full border border-accent/35 bg-accent-wash px-2 py-0.5 text-ink">
                  admin
                </span>
              ) : null}
            </p>
            <p className="t-small tabular text-ink-faint">
              {new Date(account.createdAt).toLocaleDateString()}
            </p>
          </div>

          <p className="t-small mt-1 break-all text-ink-muted">
            {account.email ?? account.pendingEmail ?? 'no address'}
            {!account.confirmed ? (
              <span className="text-[var(--warning)]"> · unconfirmed</span>
            ) : null}
          </p>

          <p className="t-small mt-1 text-ink-faint">
            {account.hasPartner ? 'paired' : 'no partner'}
            {account.pairStatus ? ` · ${account.pairStatus}` : ''}
            {` · ${account.completedDays} day${account.completedDays === 1 ? '' : 's'}`}
            {account.lastActive
              ? ` · last answered ${new Date(account.lastActive).toLocaleDateString()}`
              : ' · never answered'}
            {account.optedIn ? ' · on the list' : ''}
          </p>

          {confirming === account.userId ? (
            <div
              className="stack mt-3 rounded-[0.625rem] border border-hairline bg-paper-sunken p-4"
              style={{ ['--stack-gap' as string]: '0.75rem' }}
            >
              <p className="t-small text-ink">
                Delete {account.firstName ?? 'this account'}? Their own answers and
                tender go with it.{' '}
                {account.hasPartner
                  ? 'Their partner keeps everything and is simply unpaired — a shared history is not one person’s to erase.'
                  : 'Nobody else is in their pairing, so it goes too.'}
              </p>
              <Button variant="quiet" disabled={pending} onClick={() => remove(account.userId)}>
                {pending ? 'Deleting…' : 'Yes, delete it'}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
                Keep it
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                disabled={pending}
                onClick={() => toggleAdmin(account.userId, !account.isAdmin)}
                className="press t-small text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
              >
                {account.isAdmin ? 'Revoke admin' : 'Make admin'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(account.userId)}
                className="press t-small text-ink-faint underline decoration-hairline underline-offset-4 hover:text-ink"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
