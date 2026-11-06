'use client'

import { useState, useTransition } from 'react'
import { sendMoveEmails, sendMoveEmailTest, type MoveEmailResult } from '@/app/admin/move-actions'
import type { MoveEmailsView } from '@/lib/move-emails/summary'
import { Button, Notice } from './ui'

const TITLES = {
  announce: 'Announcement',
  week: 'Reminder: one week left',
  last: 'Reminder: last day tomorrow',
} as const

/**
 * The move emails, one card each: who it would reach now, a preview of the
 * first person's copy, a test to the founder's own address, and Send, which
 * asks once more with the count before anything goes.
 */
export function AdminMoveEmails({ view }: { view: MoveEmailsView }) {
  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
      {view.blocked ? <Notice>{view.blocked}</Notice> : null}
      <div className="grid gap-4 xl:grid-cols-3">
        {view.rows.map((row) => (
          <EmailCard key={row.email} row={row} blocked={Boolean(view.blocked)} />
        ))}
      </div>
    </div>
  )
}

function EmailCard({ row, blocked }: { row: MoveEmailsView['rows'][number]; blocked: boolean }) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ tone: 'neutral' | 'error'; text: string } | null>(null)
  const people = `${row.count} ${row.count === 1 ? 'person' : 'people'}`

  const run = (action: () => Promise<MoveEmailResult>, done: (r: MoveEmailResult) => string) => {
    setResult(null)
    startTransition(async () => {
      const r = await action()
      setConfirming(false)
      setResult(r.error ? { tone: 'error', text: r.error } : { tone: 'neutral', text: done(r) })
    })
  }

  const s = row.skipped
  const left = [
    s.alreadySent ? `${s.alreadySent} already had it` : null,
    s.moved ? `${s.moved} moved` : null,
    s.heldBack ? `${s.heldBack} held back` : null,
    s.unreachable ? `${s.unreachable} with no confirmed email` : null,
  ].filter(Boolean)

  return (
    <article className="stack rounded-[0.75rem] border border-hairline bg-paper-raised px-4 py-4" style={{ ['--stack-gap' as string]: '0.875rem' }}>
      <div>
        <h3 className="t-body font-medium text-ink">{TITLES[row.email]}</h3>
        <p className="t-small text-ink-faint">Planned for {row.planned}</p>
      </div>
      <p className="t-small text-ink">
        Goes to <strong>{people}</strong>
        {left.length ? <span className="text-ink-muted"> · Skipping {left.join(', ')}</span> : null}
      </p>

      {row.preview ? (
        <div className="stack" style={{ ['--stack-gap' as string]: '0.375rem' }}>
          <p className="t-small text-ink-muted">
            <span className="text-ink-faint">Subject:</span> {row.preview.subject}
          </p>
          <iframe
            title={`Preview of the ${TITLES[row.email].toLowerCase()}`}
            sandbox=""
            srcDoc={row.preview.html}
            className="h-[26rem] w-full rounded-[0.5rem] border border-hairline bg-white"
          />
        </div>
      ) : null}

      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}

      {row.count > 0 ? (
        <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
          <Button
            variant="quiet"
            disabled={blocked || pending}
            onClick={() => run(() => sendMoveEmailTest(row.email), () => 'A test copy is on its way to your own email.')}
          >
            Send me a test
          </Button>
          {confirming ? (
            <>
              <Button
                disabled={blocked || pending}
                onClick={() =>
                  run(
                    () => sendMoveEmails(row.email, row.count),
                    (r) => `Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.`,
                  )
                }
              >
                {pending ? 'Sending…' : `Yes, send to ${people} now`}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                Not yet
              </Button>
            </>
          ) : (
            <Button disabled={blocked || pending} onClick={() => setConfirming(true)}>
              Send to {people}
            </Button>
          )}
        </div>
      ) : (
        <p className="t-small text-ink-muted">Nobody is waiting for this email.</p>
      )}
    </article>
  )
}
