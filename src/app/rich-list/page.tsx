import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Card, NavLink, Rule, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { loadHome, loadRichList, type RichListWindow } from '@/lib/session'
import { formatTender, tender } from '@/lib/tender'

export const dynamic = 'force-dynamic'

/**
 * The Rich List.
 *
 * The copy here sells the list rather than explaining it. It used to open with
 * the scoring rules — earned not held, transfers excluded — which is true, still
 * true, and the least persuasive thing to tell somebody who is not on it. Those
 * rules live in 0008_rich_list.sql where they belong; this page's job is to make
 * a couple want their names on it.
 *
 * The mechanism underneath is unchanged: ranked on tender EARNED, so spending on
 * each other costs no position and passing tender back and forth earns none.
 *
 * One line of mechanics survives on purpose. Appearing publicly does announce
 * that two named people are a couple, and nobody should find that out afterwards
 * — so consent is still stated, just after the reason to want it rather than
 * instead of it.
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
      <div className="stack stagger" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <header className="flex items-baseline justify-between gap-4">
          <Wordmark />
          <NavLink href="/">Today</NavLink>
        </header>

        <div>
          <h1 className="t-question text-ink">The Rich List</h1>
          <p className="t-body mt-2 max-w-[30rem] text-ink-muted">
            The couples who actually know each other. Not the ones who say they
            do — the ones who guessed right, day after day, and have the number to
            prove it.
          </p>
        </div>

        <WindowTabs current={window} />

        {list.rows.length === 0 ? (
          <Card>
            <p className="t-body text-ink-muted">
              Nobody&rsquo;s here yet. Whoever comes first gets the top of an empty
              list and everyone after them arrives looking up at it.
            </p>
          </Card>
        ) : (
          <ol
            className="stack stagger"
            style={{ ['--stack-gap' as string]: '0.625rem' }}
          >
            {list.rows.map((row) => (
              <li
                key={row.rank}
                className={
                  'lift flex items-baseline gap-4 rounded-[0.75rem] border p-4 ' +
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
            'press t-small inline-flex min-h-[2.75rem] items-center rounded-full border px-4 ' +
            (current === tab.key
              ? 'border-accent/35 bg-accent-wash text-ink'
              : 'border-hairline bg-paper-raised text-ink-muted hover:text-ink')
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
  if (!standing) {
    return (
      <p className="t-small text-ink-faint">
        Pair up and the list starts counting you.
      </p>
    )
  }

  const period = window === 'week' ? 'this week' : 'so far'

  /**
   * Not on it. Lead with the position they already hold and cannot see.
   *
   * The page used to explain the scoring rules here, which is the least
   * persuasive thing it could say to somebody who has not joined. What persuades
   * is a real number: they have earned this much, and it would put them there.
   *
   * The consent line stays, shortened. Appearing publicly does say that two named
   * people are a couple, and nobody should discover that after the fact — but it
   * belongs after the reason to want it, not instead of it.
   */
  if (!standing.optedIn) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <p className="t-label">What you&rsquo;re missing</p>

        {standing.earned > 0 ? (
          <>
            <h2 className="t-question text-ink">
              You&rsquo;d be number {standing.wouldRank}.
            </h2>
            <p className="t-body text-ink-muted">
              You&rsquo;ve earned{' '}
              <span className="tabular text-ink">{tender(standing.earned)}</span>{' '}
              {period} and nobody can see it. Every couple above you is on this
              list. You are not on it.
            </p>
          </>
        ) : (
          <>
            <h2 className="t-question text-ink">
              There&rsquo;s a place here with your name on it.
            </h2>
            <p className="t-body text-ink-muted">
              Answer today&rsquo;s question and you start earning your way up it.
            </p>
          </>
        )}

        <p className="t-small text-ink-faint">
          It takes both of you, and you choose what you&rsquo;re called — your
          name, an initial, or something nobody would guess.
        </p>

        <Link href="/settings" className="block">
          <Button>Put us on the list</Button>
        </Link>
      </div>
    )
  }

  if (!standing.partnerOptedIn) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <p className="t-label">One yes short</p>
        <h2 className="t-question text-ink">
          {standing.earned > 0
            ? `Number ${standing.wouldRank}, the moment they agree.`
            : 'You said yes. They haven’t.'}
        </h2>
        <p className="t-body text-ink-muted">
          You&rsquo;re in — they haven&rsquo;t said yes yet, so neither of you
          shows. It has to be both, because the list carries both your names.
          Worth asking them tonight.
        </p>
      </div>
    )
  }

  if (standing.rank === null) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
        <p className="t-label">You&rsquo;re in</p>
        <h2 className="t-question text-ink">One question from appearing.</h2>
        <p className="t-body text-ink-muted">
          Both of you are on. Nothing earned {period} — answer today&rsquo;s
          question and your names go up.
        </p>
      </div>
    )
  }

  const ahead = standing.rank - 1

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
      <p className="t-label">Where you stand</p>
      <h2 className="t-question text-ink">
        Number <span className="tabular">{standing.rank}</span>
        {standing.listedCouples > 1 ? ` of ${standing.listedCouples}` : ''}.
      </h2>
      <p className="t-body text-ink-muted">
        <span className="tabular text-ink">{tender(standing.earned)}</span> earned{' '}
        {period}.{' '}
        {ahead === 0
          ? 'Nobody is ahead of you. Somebody is trying to be.'
          : ahead === 1
            ? 'One couple ahead of you.'
            : `${ahead} couples ahead of you.`}
      </p>
    </div>
  )
}
