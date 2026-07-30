import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Card, NavLink, Rule, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { loadHistory, loadHome, type HistoryEntry } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Everything you've already seen.
 *
 * Until now the only way to reach your own history was downloading a JSON file.
 * That's an export, not a place to read — and the accumulated history is the
 * whole reason to still be here in month two.
 *
 * Grouped by month rather than presented as one long list. A flat list of 200
 * rows is a database table; months give it the shape of a thing that happened
 * over time, and make "we were better in March" visible without any charting.
 */
export default async function HistoryPage() {
  if (!isConfigured()) return <SetupNotice />

  const home = await loadHome()
  if (!home || !home.me.firstName) redirect('/')
  if (!home.pair) redirect('/')

  const history = await loadHistory()
  const them = home.partner?.firstName ?? 'your partner'

  return (
    <Screen>
      <div className="stack stagger" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <header className="flex items-baseline justify-between gap-4">
          <Wordmark />
          <NavLink href="/">Today</NavLink>
        </header>

        <div>
          <h1 className="t-question text-ink">Everything so far</h1>
          <p className="t-body mt-2 text-ink-muted">
            Every question the two of you have finished. Tap any day to see the
            reveal again.
          </p>
        </div>

        {!history || history.total === 0 ? (
          <Card>
            <p className="t-body text-ink-muted">
              Nothing here yet. A day lands here once you and {them} have both
              answered it — the first one will be today&rsquo;s.
            </p>
          </Card>
        ) : (
          <>
            <Summary
              total={history.total}
              average={history.average}
              best={history.best}
            />

            <Rule />

            {groupByMonth(history.entries).map(([month, entries]) => (
              <section
                key={month}
                className="stack"
                style={{ ['--stack-gap' as string]: '0.75rem' }}
              >
                <h2 className="t-label">{month}</h2>
                <ol className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
                  {entries.map((entry) => (
                    <li key={entry.dayIndex}>
                      <Link
                        href={`/reveal/${entry.dayIndex}`}
                        className="lift flex items-center gap-4 rounded-[0.75rem] border border-hairline bg-paper-raised p-4"
                      >
                        <span className="w-11 shrink-0 text-center">
                          <span className="t-title block tabular text-ink">
                            {entry.syncScore}
                            <span className="text-[0.7em] text-ink-faint">%</span>
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="t-body block truncate text-ink">
                            {entry.prompt}
                          </span>
                          <span className="t-small text-ink-faint">
                            Day {entry.dayIndex + 1} · {dayOfMonth(entry.date)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}

        <Rule />

        <Link href="/" className="block pb-4">
          <Button variant="quiet">Back to today</Button>
        </Link>
      </div>
    </Screen>
  )
}

function Summary({
  total,
  average,
  best,
}: {
  total: number
  average: number
  best: HistoryEntry | null
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Stat label="Days" value={String(total)} />
      <Stat label="Average" value={`${average}%`} />
      <Stat label="Best" value={best ? `${best.syncScore}%` : '—'} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.75rem] border border-hairline bg-paper-sunken px-3 py-3.5 text-center">
      <p className="font-serif text-[1.75rem] leading-none tracking-tight tabular text-ink">
        {value}
      </p>
      <p className="t-label mt-1.5">{label}</p>
    </div>
  )
}

/**
 * Newest month first, days newest-first within it.
 *
 * Built from the pair-local date string rather than a Date, so a reveal never
 * drifts into the neighbouring month because the reader is in a different
 * timezone than the pairing.
 */
function groupByMonth(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  const groups = new Map<string, HistoryEntry[]>()

  for (const entry of entries) {
    const [year, month] = entry.date.split('-')
    const key = `${MONTHS[Number(month) - 1]} ${year}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(entry)
    else groups.set(key, [entry])
  }

  // entries already arrive newest-first, so insertion order is the order we want.
  return [...groups.entries()]
}

function dayOfMonth(date: string): string {
  const day = Number(date.split('-')[2])
  return `${day}${ordinal(day)}`
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th'
  if (n % 10 === 1) return 'st'
  if (n % 10 === 2) return 'nd'
  if (n % 10 === 3) return 'rd'
  return 'th'
}
