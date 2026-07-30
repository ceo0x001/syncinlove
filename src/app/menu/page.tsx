import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MenuEditor } from '@/components/menu-editor'
import { PurchaseList } from '@/components/purchase-list'
import { SetupNotice } from '@/components/setup-notice'
import { TheirMenu } from '@/components/their-menu'
import { Button, NavLink, Rule, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { loadHome } from '@/lib/session'
import { daysOfSyncing, formatTender, tender } from '@/lib/tender'
import { settleOpenDays } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function MenuPage() {
  if (!isConfigured()) return <SetupNotice />

  // Pays the completion floor for any day answered alone whose window has since
  // closed. No scheduler in this app — somebody opening it is the only trigger
  // needed, and it's idempotent.
  await settleOpenDays()

  const home = await loadHome()
  if (!home || !home.me.firstName) redirect('/')
  if (!home.pair || !home.economy) redirect('/')

  const { economy, partner } = home
  const them = partner?.firstName ?? 'your partner'
  // Capitalised variant for anywhere the name opens a sentence or a heading.
  const Them = partner?.firstName ?? 'Your partner'

  return (
    <Screen>
      <div className="stack stagger" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <header className="flex items-baseline justify-between gap-4">
          <Wordmark />
          <NavLink href="/">Today</NavLink>
        </header>

        <Wallets economy={economy} myName={home.me.firstName} theirName={them} />

        <Rule />

        <section className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
          <div>
            <h2 className="t-question text-ink">{Them}’s menu</h2>
            <p className="t-body mt-2 text-ink-muted">
              What they’re willing to do, at their prices.
            </p>
          </div>
          <TheirMenu economy={economy} partnerFirstName={them} />
        </section>

        <Rule />

        <section className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
          <div>
            <h2 className="t-question text-ink">Your menu</h2>
            <p className="t-body mt-2 text-ink-muted">
              Only you write this, and only you price it.
            </p>
          </div>
          <MenuEditor items={economy.myMenu} suggestPrompt={economy.shouldPromptMenu} />
        </section>

        {economy.purchases.length > 0 ? (
          <>
            <Rule />
            <PurchaseList purchases={economy.purchases} partnerFirstName={them} />
          </>
        ) : null}

        <Rule />

        <Link href="/" className="block pb-4">
          <Button variant="quiet">Back to today</Button>
        </Link>
      </div>
    </Screen>
  )
}

/**
 * The balance mirror.
 *
 * Shows both wallets and both menus' average price side by side. Not a rule — a
 * mirror. The failure mode it guards against is one partner pricing everything
 * out of reach while spending freely on cheap items, and the cheapest defence
 * against that is simply making the asymmetry visible to both people. Nobody
 * needs telling off; they need to be able to see it.
 */
function Wallets({
  economy,
  myName,
  theirName,
}: {
  economy: import('@/lib/session').Economy
  myName: string
  theirName: string
}) {
  const avg = (items: { price: number; active: boolean }[]) => {
    const live = items.filter((i) => i.active)
    if (live.length === 0) return null
    return Math.round(live.reduce((sum, i) => sum + i.price, 0) / live.length)
  }

  const myAvg = avg(economy.myMenu)
  const theirAvg = avg(economy.theirMenu)

  const redeemed = economy.purchases.filter((p) => p.status === 'fulfilled')
  const myRedeemed = redeemed.filter((p) => p.iBought).length
  const theirRedeemed = redeemed.length - myRedeemed

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
      <div className="flex items-baseline justify-between gap-6">
        <div>
          <p className="t-label mb-1.5">Yours</p>
          <p className="font-serif text-[2.25rem] leading-none tracking-tight tabular text-ink">
            <span className="text-[0.55em] text-ink-muted">T</span>
            {formatTender(economy.mine.balance)}
          </p>
          <p className="t-small mt-1 text-ink-faint">
            {daysOfSyncing(economy.mine.balance)} days of syncing
            {economy.mine.received > 0
              ? ` · ${tender(economy.mine.received)} of it earned by doing things`
              : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="t-label mb-1.5">{theirName}’s</p>
          <p className="font-serif text-[2.25rem] leading-none tracking-tight tabular text-ink-muted">
            <span className="text-[0.55em]">T</span>
            {formatTender(economy.theirs.balance)}
          </p>
        </div>
      </div>

      {economy.pilingUp ? (
        <div className="rounded-[0.75rem] bg-accent-wash px-4 py-3">
          <p className="t-small text-ink">
            Your tender is piling up faster than you&rsquo;re spending it. Nothing
            on {theirName}&rsquo;s menu costs enough to matter any more — worth the
            two of you repricing.
          </p>
        </div>
      ) : null}

      {myAvg !== null || theirAvg !== null ? (
        <div className="rounded-[0.75rem] bg-paper-sunken px-4 py-3">
          <p className="t-small text-ink-muted">
            {myAvg !== null ? (
              <>
                {myName}’s menu averages <span className="tabular">{tender(myAvg)}</span>
              </>
            ) : (
              <>{myName} hasn’t priced anything yet</>
            )}
            {' · '}
            {theirAvg !== null ? (
              <>
                {theirName}’s averages <span className="tabular">{tender(theirAvg)}</span>
              </>
            ) : (
              <>{theirName} hasn’t priced anything yet</>
            )}
          </p>
          {redeemed.length > 0 ? (
            <p className="t-small mt-1 text-ink-faint">
              Redeemed: {myRedeemed} by you, {theirRedeemed} by {theirName}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
