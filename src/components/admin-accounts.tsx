'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import {
  adminDeleteAccount,
  adminResendCode,
  adminSetAdmin,
  adminSetSuspended,
} from '@/app/actions'
import type { AdminAccount } from '@/lib/session'
import { Button, Notice } from './ui'

/**
 * The accounts table.
 *
 * A table at desk width and cards on a phone, because these are two different
 * reading jobs: scanning forty rows for the one with no confirmed email wants
 * columns that line up, and doing the same on a phone wants one account at a
 * time. Squeezing seven columns into 375px serves neither.
 *
 * A row expands rather than linking away, so following up on somebody never
 * loses your place in the list. What expands is still only metadata — who they
 * are paired with, when they last answered, whether they can get back in. No
 * answers, no menu items, no letters: users are told "neither of you sees
 * anything until you both have" and "only you write this", and this console
 * exists without making either untrue.
 *
 * Deliberately no "add account". Signing up is the only way an account comes to
 * exist, and a console that could mint one would need a password or an invite
 * path that does not exist — a button that cannot work is worse than no button.
 */

/**
 * 50 a page.
 *
 * Filtering and sorting happen here rather than on the server, so narrowing a
 * list is instant instead of a round trip. The trade is that only the first 500
 * accounts are in the browser to filter — fine now, and the point at which this
 * wants server-side offsets is when 500 is no longer everybody.
 */
const PAGE = 50

type StatusFilter = 'all' | 'active' | 'unconfirmed' | 'suspended' | 'admin' | 'listed'
type PairFilter = 'all' | 'paired' | 'waiting' | 'none'
type Sort = 'newest' | 'oldest' | 'days' | 'active'

export function AdminAccounts({ accounts }: { accounts: AdminAccount[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<'delete' | 'suspend' | null>(null)
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [pairing, setPairing] = useState<PairFilter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const matchesStatus = (a: AdminAccount) => {
      switch (status) {
        // "Active" means usable: confirmed and not stopped. An unconfirmed
        // account is the one an operator most often needs to find, so it gets
        // its own filter rather than being folded into "not active".
        case 'active':
          return a.confirmed && !a.suspendedAt
        case 'unconfirmed':
          return !a.confirmed
        case 'suspended':
          return Boolean(a.suspendedAt)
        case 'admin':
          return a.isAdmin
        case 'listed':
          return a.optedIn
        default:
          return true
      }
    }

    const matchesPairing = (a: AdminAccount) => {
      switch (pairing) {
        case 'paired':
          return Boolean(a.partnerName)
        case 'waiting':
          return Boolean(a.pairId) && !a.partnerName
        case 'none':
          return !a.pairId
        default:
          return true
      }
    }

    const rows = accounts.filter((a) => matchesStatus(a) && matchesPairing(a))

    const byDate = (x: string | null) => (x ? new Date(x).getTime() : 0)

    return [...rows].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return byDate(a.createdAt) - byDate(b.createdAt)
        case 'days':
          return b.completedDays - a.completedDays
        case 'active':
          // Never-answered last rather than first: an operator sorting by
          // activity is looking for who is active, and a wall of nulls on top
          // buries the answer.
          return byDate(b.lastActive) - byDate(a.lastActive)
        default:
          return byDate(b.createdAt) - byDate(a.createdAt)
      }
    })
  }, [accounts, status, pairing, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const current = Math.min(page, pages - 1)
  const shown = useMemo(
    () => filtered.slice(current * PAGE, current * PAGE + PAGE),
    [filtered, current],
  )

  function run(action: () => Promise<{ error?: string; ok?: boolean }>, done?: string) {
    setError(null)
    setNote(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else if (done) setNote(done)
    })
  }

  /** Runs sequentially so one failure reports rather than being lost in a race. */
  function runBulk(
    ids: string[],
    action: (id: string) => Promise<{ error?: string }>,
    done: (n: number) => string,
  ) {
    setError(null)
    setNote(null)
    startTransition(async () => {
      let ok = 0
      for (const id of ids) {
        const result = await action(id)
        if (result.error) {
          setError(`${result.error} (${ok} of ${ids.length} done)`)
          return
        }
        ok++
      }
      setSelected(new Set())
      setConfirming(null)
      setNote(done(ok))
    })
  }

  function setFilter<T>(set: (v: T) => void) {
    return (value: T) => {
      set(value)
      setPage(0)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allShownSelected = shown.length > 0 && shown.every((a) => selected.has(a.userId))

  if (accounts.length === 0) {
    return (
      <Notice>
        No accounts came back. If you expected some, that is a query failing
        rather than an empty database — the server log names the reason.
      </Notice>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {note ? <Notice>{note}</Notice> : null}

      {/* ---- Filters. Above the bulk bar so these never shift as you select. ---- */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterGroup
          label="Status"
          value={status}
          onChange={setFilter(setStatus)}
          options={[
            ['all', 'All'],
            ['active', 'Active'],
            ['unconfirmed', 'Unconfirmed'],
            ['suspended', 'Suspended'],
            ['admin', 'Admins'],
            ['listed', 'On the list'],
          ]}
        />
        <FilterGroup
          label="Pairing"
          value={pairing}
          onChange={setFilter(setPairing)}
          options={[
            ['all', 'All'],
            ['paired', 'Paired'],
            ['waiting', 'Waiting'],
            ['none', 'None'],
          ]}
        />
        <FilterGroup
          label="Sort"
          value={sort}
          onChange={setFilter(setSort)}
          options={[
            ['newest', 'Newest'],
            ['oldest', 'Oldest'],
            ['days', 'Most days'],
            ['active', 'Last answered'],
          ]}
        />
      </div>

      {filtered.length !== accounts.length ? (
        <p className="t-small text-ink-faint">
          {filtered.length} of {accounts.length} shown by these filters.
        </p>
      ) : null}

      {/* ---- Bulk bar. Only present when it has something to act on. ---- */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[0.75rem] border border-accent/35 bg-accent-wash px-4 py-3">
          <span className="t-small text-ink">
            {selected.size} selected
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <Action
              disabled={pending}
              onClick={() =>
                runBulk(
                  [...selected],
                  (id) => adminSetSuspended(id, true),
                  (n) => `${n} suspended.`,
                )
              }
            >
              Suspend
            </Action>
            <Action
              disabled={pending}
              onClick={() =>
                runBulk(
                  [...selected],
                  (id) => adminSetSuspended(id, false),
                  (n) => `${n} reinstated.`,
                )
              }
            >
              Reinstate
            </Action>
            <Action disabled={pending} faint onClick={() => setConfirming('delete')}>
              Delete
            </Action>
            <Action disabled={pending} faint onClick={() => setSelected(new Set())}>
              Clear
            </Action>
          </span>
        </div>
      ) : null}

      {confirming === 'delete' ? (
        <div
          className="stack rounded-[0.75rem] border border-hairline bg-paper-sunken p-4"
          style={{ ['--stack-gap' as string]: '0.75rem' }}
        >
          <p className="t-small text-ink">
            Delete {selected.size} account{selected.size === 1 ? '' : 's'}? Each
            one&rsquo;s own answers and tender go with it. Anybody still paired
            with them keeps everything and is simply unpaired — a shared history
            is not one person&rsquo;s to erase.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="quiet"
              disabled={pending}
              onClick={() =>
                runBulk(
                  [...selected],
                  (id) => adminDeleteAccount(id),
                  (n) => `${n} deleted.`,
                )
              }
            >
              {pending ? 'Deleting…' : 'Yes, delete them'}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
              Keep them
            </Button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Notice>
          Nothing matches those filters. There are {accounts.length} accounts in
          total.
        </Notice>
      ) : null}

      {/* ---- Desk: the table ---- */}
      <div className="hidden overflow-x-auto rounded-[0.75rem] border border-hairline lg:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline bg-paper-sunken">
              <Th className="w-10">
                <input
                  type="checkbox"
                  checked={allShownSelected}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (allShownSelected) shown.forEach((a) => next.delete(a.userId))
                      else shown.forEach((a) => next.add(a.userId))
                      return next
                    })
                  }
                  aria-label="Select every account on this page"
                  className="size-[1.05rem] accent-[var(--accent)]"
                />
              </Th>
              <Th className="w-8" />
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Paired with</Th>
              <Th className="text-right">Days</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <Fragment key={a.userId}>
                <tr
                  className={
                    'border-b border-hairline last:border-0 ' +
                    (selected.has(a.userId) ? 'bg-accent-wash/50' : 'hover:bg-paper-sunken/50')
                  }
                >
                  <Td>
                    <input
                      type="checkbox"
                      checked={selected.has(a.userId)}
                      onChange={() => toggle(a.userId)}
                      aria-label={`Select ${a.firstName ?? 'this account'}`}
                      className="size-[1.05rem] accent-[var(--accent)]"
                    />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === a.userId ? null : a.userId)}
                      aria-label={expanded === a.userId ? 'Hide detail' : 'Show detail'}
                      className="press text-ink-faint hover:text-ink"
                    >
                      <Chevron open={expanded === a.userId} />
                    </button>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={a.firstName} />
                      <span className="t-body text-ink">
                        {a.firstName ?? <span className="text-ink-faint">no name</span>}
                      </span>
                    </span>
                  </Td>
                  <Td className="t-small break-all text-ink-muted">
                    {a.email ?? a.pendingEmail ?? '—'}
                  </Td>
                  <Td className="t-small text-ink-muted">
                    {a.partnerName ?? (a.pairId ? 'waiting' : '—')}
                  </Td>
                  <Td className="t-small tabular text-right text-ink">{a.completedDays}</Td>
                  <Td>
                    <Pills account={a} />
                  </Td>
                  <Td className="text-right">
                    <RowActions account={a} pending={pending} run={run} />
                  </Td>
                </tr>

                {expanded === a.userId ? (
                  <tr className="border-b border-hairline bg-paper-sunken/60">
                    <td colSpan={8} className="px-4 py-4">
                      <Detail account={a} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Phone: one at a time ---- */}
      <div className="stack lg:hidden" style={{ ['--stack-gap' as string]: '0.625rem' }}>
        {shown.map((a) => (
          <div
            key={a.userId}
            className="rounded-[0.75rem] border border-hairline bg-paper-raised p-4"
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(a.userId)}
                onChange={() => toggle(a.userId)}
                aria-label={`Select ${a.firstName ?? 'this account'}`}
                className="mt-1 size-[1.05rem] shrink-0 accent-[var(--accent)]"
              />
              <Avatar name={a.firstName} />
              <div className="min-w-0 flex-1">
                <p className="t-title text-ink">
                  {a.firstName ?? <span className="text-ink-faint">no name yet</span>}
                </p>
                <p className="t-small break-all text-ink-muted">
                  {a.email ?? a.pendingEmail ?? 'no address'}
                </p>
                <div className="mt-1.5">
                  <Pills account={a} />
                </div>
              </div>
            </div>

            <div className="mt-3 border-t border-hairline pt-3">
              <Detail account={a} />
            </div>

            <div className="mt-3">
              <RowActions account={a} pending={pending} run={run} />
            </div>
          </div>
        ))}
      </div>

      {/* ---- Pagination. Always here, bounded rather than hidden, so the
              controls do not appear and vanish as filters change. ---- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="t-small tabular text-ink-faint">
          {filtered.length === 0
            ? 'Nothing to show'
            : `${current * PAGE + 1}–${Math.min((current + 1) * PAGE, filtered.length)} of ${filtered.length}`}
          {pages > 1 ? ` · page ${current + 1} of ${pages}` : ''}
        </p>
        <div className="flex gap-2">
          <Page disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Page>
          <Page disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </Page>
        </div>
      </div>
    </div>
  )
}

/**
 * Initials in a tinted circle.
 *
 * There are no photographs in this app and there should not be — it would be a
 * new category of personal data collected for decoration. The hue comes from the
 * name so the same person is the same colour every time, which is what makes an
 * avatar useful for scanning at all.
 */
function Avatar({ name }: { name: string | null }) {
  const letter = (name ?? '?').trim().charAt(0).toUpperCase() || '?'
  const hue = [...(name ?? '?')].reduce((h, c) => h + c.charCodeAt(0), 0) % 360

  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-medium"
      style={{
        background: `oklch(0.92 0.06 ${hue})`,
        color: `oklch(0.35 0.09 ${hue})`,
      }}
    >
      {letter}
    </span>
  )
}

function Pills({ account }: { account: AdminAccount }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {account.suspendedAt ? (
        <Pill tone="warn">Suspended</Pill>
      ) : account.confirmed ? (
        <Pill tone="good">Active</Pill>
      ) : (
        <Pill tone="warn">Unconfirmed</Pill>
      )}
      {account.isAdmin ? <Pill tone="accent">Admin</Pill> : null}
      {account.optedIn ? <Pill tone="plain">On the list</Pill> : null}
    </span>
  )
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'good' | 'warn' | 'accent' | 'plain'
}) {
  const tones = {
    good: 'border-[var(--success)]/35 text-ink',
    warn: 'border-[var(--warning)]/45 text-ink',
    accent: 'border-accent/40 bg-accent-wash text-ink',
    plain: 'border-hairline text-ink-muted',
  }
  const dots = {
    good: 'var(--success)',
    warn: 'var(--warning)',
    accent: 'var(--accent)',
    plain: 'var(--ink-faint)',
  }

  return (
    <span
      className={`t-label inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 ${tones[tone]}`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ background: dots[tone] }}
      />
      {children}
    </span>
  )
}

/** The expanded row. Metadata only — see the note at the top of this file. */
function Detail({ account }: { account: AdminAccount }) {
  const items: [string, string][] = [
    ['Paired with', account.partnerName ?? (account.pairId ? 'nobody yet' : 'no pairing')],
    ['Their email', account.partnerEmail ?? '—'],
    ['Pairing', account.pairStatus ?? '—'],
    ['Days completed', String(account.completedDays)],
    [
      'Last answered',
      account.lastActive ? new Date(account.lastActive).toLocaleDateString() : 'never',
    ],
    ['Joined', new Date(account.createdAt).toLocaleDateString()],
    ['Address confirmed', account.confirmed ? 'yes' : 'no — cannot be recovered'],
    [
      'Suspended',
      account.suspendedAt
        ? `${new Date(account.suspendedAt).toLocaleDateString()}${
            account.suspendedReason ? ` — ${account.suspendedReason}` : ''
          }`
        : 'no',
    ],
  ]

  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="t-label">{label}</dt>
          <dd className="t-small mt-0.5 break-all text-ink-muted">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function RowActions({
  account,
  pending,
  run,
}: {
  account: AdminAccount
  pending: boolean
  run: (action: () => Promise<{ error?: string; ok?: boolean }>, done?: string) => void
}) {
  return (
    <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
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
    </span>
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
        'press t-small whitespace-nowrap underline underline-offset-4 hover:text-ink disabled:opacity-40 ' +
        (faint
          ? 'text-ink-faint decoration-hairline'
          : 'text-ink-muted decoration-hairline-strong')
      }
    >
      {children}
    </button>
  )
}

/**
 * A row of chips rather than a <select>.
 *
 * The states worth filtering by are the point of the screen — unconfirmed,
 * suspended, waiting — and a closed dropdown hides which one is active behind a
 * click. Chips show the current filter and every alternative at once, which is
 * what makes them worth the space here and not elsewhere in the app.
 */
function FilterGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: [T, string][]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="t-label text-ink-faint">{label}</span>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={
            'press t-small whitespace-nowrap rounded-full border px-3 py-1.5 ' +
            (value === key
              ? 'border-accent/40 bg-accent-wash text-ink'
              : 'border-hairline bg-paper-raised text-ink-muted hover:text-ink')
          }
        >
          {text}
        </button>
      ))}
    </div>
  )
}

function Page({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press t-label min-h-[2.5rem] rounded-full border border-hairline bg-paper-raised px-4 text-ink-muted hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`t-label px-4 py-3 font-medium ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
}
