'use client'

import { useState, useTransition } from 'react'
import {
  adminDeleteAccount,
  adminResendCode,
  adminSetAdmin,
  adminSetSuspended,
} from '@/app/actions'
import type { AdminAccount } from '@/lib/session'
import { Button, Notice } from './ui'

/**
 * The account list.
 *
 * A table at desk width and cards on a phone, because these are genuinely two
 * different reading jobs. Scanning forty accounts for the one that has not
 * confirmed an email wants columns that line up; doing the same on a phone wants
 * one account at a time. Squeezing the table into 375px produces neither.
 *
 * Metadata only — a name, an address, who they are paired with, whether they can
 * get back in, how active they are. No answers, no menu items, no letters. Users
 * are told "neither of you sees anything until you both have" and "only you write
 * this", and this screen exists without making either of those untrue.
 *
 * Deleting asks twice and says what it will and will not take. The guard lives in
 * the database: a pairing is only removed when nobody real is left in it, so
 * removing one half of a couple unpairs the other rather than erasing their
 * history alongside.
 */
export function AdminAccounts({ accounts }: { accounts: AdminAccount[] }) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(
    action: () => Promise<{ error?: string; ok?: boolean }>,
    done?: string,
  ) {
    setError(null)
    setNote(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else {
        setConfirming(null)
        if (done) setNote(done)
      }
    })
  }

  if (accounts.length === 0) {
    return (
      <Notice>
        No accounts came back. If you expected some, that is a query failing
        rather than an empty database — the server log names the reason.
      </Notice>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {note ? <Notice>{note}</Notice> : null}

      {/* ---- Desk: a real table ---- */}
      <div className="hidden overflow-x-auto rounded-[0.75rem] border border-hairline lg:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline bg-paper-sunken">
              <Th>Who</Th>
              <Th>Email</Th>
              <Th>Paired with</Th>
              <Th className="text-right">Days</Th>
              <Th>Last answered</Th>
              <Th>Joined</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr
                key={a.userId}
                className="border-b border-hairline last:border-0 hover:bg-paper-sunken/60"
              >
                <Td>
                  <span className="t-body block text-ink">
                    {a.firstName ?? <span className="text-ink-faint">no name</span>}
                  </span>
                  <span className="t-small flex flex-wrap gap-x-2 text-ink-faint">
                    {a.isAdmin ? <span className="text-ink">admin</span> : null}
                    {a.suspendedAt ? (
                      <span className="text-[var(--warning)]">suspended</span>
                    ) : null}
                    {a.optedIn ? <span>on the list</span> : null}
                  </span>
                </Td>
                <Td>
                  <span className="t-small block break-all text-ink-muted">
                    {a.email ?? a.pendingEmail ?? '—'}
                  </span>
                  {!a.confirmed ? (
                    <span className="t-small text-[var(--warning)]">unconfirmed</span>
                  ) : null}
                </Td>
                <Td>
                  <span className="t-small block text-ink-muted">
                    {a.partnerName ?? (a.pairId ? 'waiting' : '—')}
                  </span>
                  {a.partnerEmail ? (
                    <span className="t-small block break-all text-ink-faint">
                      {a.partnerEmail}
                    </span>
                  ) : null}
                </Td>
                <Td className="t-small tabular text-right text-ink">{a.completedDays}</Td>
                <Td className="t-small text-ink-faint">
                  {a.lastActive ? new Date(a.lastActive).toLocaleDateString() : 'never'}
                </Td>
                <Td className="t-small tabular text-ink-faint">
                  {new Date(a.createdAt).toLocaleDateString()}
                </Td>
                <Td className="text-right">
                  <Actions
                    account={a}
                    pending={pending}
                    run={run}
                    confirming={confirming === a.userId}
                    onAskDelete={() => setConfirming(a.userId)}
                    onCancel={() => setConfirming(null)}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Phone: one account at a time ---- */}
      <div className="stack lg:hidden" style={{ ['--stack-gap' as string]: '0.625rem' }}>
        {accounts.map((a) => (
          <div
            key={a.userId}
            className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="t-title text-ink">
                {a.firstName ?? <span className="text-ink-faint">no name yet</span>}
                {a.isAdmin ? (
                  <span className="t-label ml-2 rounded-full border border-accent/35 bg-accent-wash px-2 py-0.5 text-ink">
                    admin
                  </span>
                ) : null}
              </p>
              <p className="t-small tabular text-ink-faint">
                {new Date(a.createdAt).toLocaleDateString()}
              </p>
            </div>

            <p className="t-small mt-1 break-all text-ink-muted">
              {a.email ?? a.pendingEmail ?? 'no address'}
              {!a.confirmed ? (
                <span className="text-[var(--warning)]"> · unconfirmed</span>
              ) : null}
            </p>

            <p className="t-small mt-1 text-ink-faint">
              {a.partnerName
                ? `with ${a.partnerName}`
                : a.pairId
                  ? 'waiting on a partner'
                  : 'no pairing'}
              {` · ${a.completedDays} day${a.completedDays === 1 ? '' : 's'}`}
              {a.lastActive
                ? ` · last answered ${new Date(a.lastActive).toLocaleDateString()}`
                : ' · never answered'}
            </p>

            {a.suspendedAt ? (
              <p className="t-small mt-1 text-[var(--warning)]">
                Suspended {new Date(a.suspendedAt).toLocaleDateString()}
                {a.suspendedReason ? ` — ${a.suspendedReason}` : ''}
              </p>
            ) : null}

            <div className="mt-3">
              <Actions
                account={a}
                pending={pending}
                run={run}
                confirming={confirming === a.userId}
                onAskDelete={() => setConfirming(a.userId)}
                onCancel={() => setConfirming(null)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`t-label px-3 py-2.5 font-medium ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-top ${className}`}>{children}</td>
}

function Actions({
  account,
  pending,
  run,
  confirming,
  onAskDelete,
  onCancel,
}: {
  account: AdminAccount
  pending: boolean
  run: (action: () => Promise<{ error?: string; ok?: boolean }>, done?: string) => void
  confirming: boolean
  onAskDelete: () => void
  onCancel: () => void
}) {
  if (confirming) {
    return (
      <div
        className="stack rounded-[0.625rem] border border-hairline bg-paper-sunken p-3 text-left"
        style={{ ['--stack-gap' as string]: '0.625rem' }}
      >
        <p className="t-small text-ink">
          Delete {account.firstName ?? 'this account'}?{' '}
          {account.partnerName
            ? `${account.partnerName} keeps everything and is simply unpaired — a shared history is not one person’s to erase.`
            : 'Nobody else is in their pairing, so it goes too.'}
        </p>
        <Button
          variant="quiet"
          disabled={pending}
          onClick={() => run(() => adminDeleteAccount(account.userId))}
        >
          {pending ? 'Deleting…' : 'Yes, delete'}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          Keep it
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
      <Action
        disabled={pending}
        onClick={() => run(() => adminSetSuspended(account.userId, !account.suspendedAt))}
      >
        {account.suspendedAt ? 'Reinstate' : 'Suspend'}
      </Action>
      {account.email ? (
        <Action
          disabled={pending}
          onClick={() =>
            run(
              () => adminResendCode(account.email as string),
              `A sign-in code is on its way to ${account.email}.`,
            )
          }
        >
          Send code
        </Action>
      ) : null}
      <Action
        disabled={pending}
        onClick={() => run(() => adminSetAdmin(account.userId, !account.isAdmin))}
      >
        {account.isAdmin ? 'Revoke admin' : 'Make admin'}
      </Action>
      <Action disabled={pending} onClick={onAskDelete} faint>
        Delete
      </Action>
    </div>
  )
}

function Action({
  children,
  onClick,
  disabled,
  faint = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  faint?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        'press t-small whitespace-nowrap underline underline-offset-4 hover:text-ink ' +
        (faint
          ? 'text-ink-faint decoration-hairline'
          : 'text-ink-muted decoration-hairline-strong')
      }
    >
      {children}
    </button>
  )
}
