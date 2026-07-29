import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Card, Rule, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { loadHome, loadRichList, type RichListWindow } from '@/lib/session'
import { formatTender, tender } from '@/lib/tender'

export const dynamic = 'force-dynamic'

/**
 * The Rich List.
 *
 * Ranks couples on tender EARNED, never held. Earned is payouts and streak
 * bonuses only, so passing tender between two wallets or refunding a purchase
 * moves nobody. Ranking on balance would have rewarded hoarding and made
 * spending on each other cost you position — the opposite of the point.
 *
 * Appearing takes both partners opting in, and the page says so plainly rather
 * than leaving anyone to discover their name went public.
 */
export default async function RichListPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  if (!isConfigured()) return <SetupNotice />

  const home = await loadHome()
  if (!home || !home.me.firstName) redirect('/')

  const { window: raw } = await searchParams
  const window: RichListWindow = raw === 'week' ? 'week' : 'all'

  const list = await loadRichList(window)
  const standing = list.standing

  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <header className="flex items-baseline justify-between gap-4">
          <Wordmark />
          <Link href="/" className="t-small text-ink-muted hover:text-ink">
            Today
          </Link>
        </header>

        <div>
          <h1 className="t-question text-ink">The Rich List</h1>
          <p className="t-body mt-2 text-ink-muted">
            Couples ranked by tender <em>earned</em> — not held. Spending on each
            other costs you nothing here, and passing tender back and forth earns
            you nothing either.
          </p>
        </div>

        <WindowTabs current={window} />

        {list.rows.length === 0 ? (
          <Card>
            <p className="t-body text-ink-muted">
              Nobody&rsquo;s on it yet. The list fills itself in as couples opt in
              and start earning — there&rsquo;s nothing to wait for beyond that.
            </p>
          </Card>
        ) : (
          <ol className="stack" style={{ ['--stack-gap' as string]: '0.625rem' }}>
            {list.rows.map((row) => (
              <li
                key={row.rank}
                className={
                  'flex items-baseline gap-4 rounded-[0.75rem] border p-4 ' +
                  (row.isMine
                    ? 'border-accent bg-accent-wash'
                    : 'border-hairline bg-paper-raised')
                }
              >
                <span className="t-title w-8 shrink-0 tabular text-ink-faint">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-title block break-words text-ink">
                    {row.labelA} &amp; {row.labelB}
                  </span>
                  {row.isMine ? (
                    <span className="t-small text-ink-muted">That&rsquo;s you.</span>
                  ) : null}
                </span>
                <span className="t-title shrink-0 tabular text-ink">
                  <span className="text-[0.75em] text-ink-muted">T</span>
                  {formatTender(row.earned)}
                </span>
              </li>
            ))}
          </ol>
        )}

        <Rule />

        <Standing standing={standing} window={window} />

        <Rule />

        <Link href="/" className="block pb-4">
          <Button variant="quiet">Back to today</Button>
        </Link>
      </div>
    </Screen>
  )
}

function WindowTabs({ current }: { current: RichListWindow }) {
  const tabs: { key: RichListWindow; label: string }[] = [
    { key: 'week', label: 'Last 7 days' },
    { key: 'all', label: 'All time' },
  ]

  return (
    <div className="flex gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`/rich-list?window=${tab.key}`}
          className={
            't-small rounded-full px-4 py-2 ' +
            (current === tab.key
              ? 'bg-accent-wash text-ink'
              : 'text-ink-muted hover:text-ink')
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

/**
 * Where you stand, and — more usefully — why you might not be there.
 *
 * "Not on the list" has three different causes and they need three different
 * sentences: you haven't opted in, your partner hasn't, or you both have and
 * haven't earned in this window yet. Collapsing them into one message is how
 * somebody concludes the feature is broken.
 */
function Standing({
  standing,
  window,
}: {
  standing: import('@/lib/session').RichListStanding | null
  window: RichListWindow
}) {
  const period = window === 'week' ? 'in the last seven days' : 'yet'

  if (!standing) {
    return (
      <p className="t-small text-ink-faint">
        Pair up and the list starts counting you.
      </p>
    )
  }

  if (!standing.optedIn) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <p className="t-label">You&rsquo;re not on it</p>
        <p className="t-body text-ink-muted">
          Joining is off by default, deliberately — a public list showing two
          first names says publicly that those two people are a couple. You choose
          whether to appear and what to be called, in Settings.
        </p>
        <Link href="/settings" className="block">
          <Button variant="quiet">Decide in Settings</Button>
        </Link>
      </div>
    )
  }

  if (!standing.partnerOptedIn) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <p className="t-label">Waiting on your person</p>
        <p className="t-body text-ink-muted">
          You&rsquo;ve opted in, they haven&rsquo;t. It takes both of you, because
          appearing here reveals something about them too — so it isn&rsquo;t
          yours alone to decide.
        </p>
      </div>
    )
  }

  if (standing.rank === null) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <p className="t-label">You&rsquo;re in</p>
        <p className="t-body text-ink-muted">
          Both of you are opted in. Nothing earned {period} — answer today&rsquo;s
          question and you&rsquo;ll appear.
        </p>
      </div>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
      <p className="t-label">Where you stand</p>
      <p className="t-body text-ink">
        Number <span className="tabular">{standing.rank}</span>, on{' '}
        <span className="tabular">{tender(standing.earned)}</span> earned
        {window === 'week' ? ' this week' : ''}.
      </p>
    </div>
  )
}
