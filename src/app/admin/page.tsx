import { redirect } from 'next/navigation'
import { AdminAccounts } from '@/components/admin-accounts'
import { AdminShell } from '@/components/admin-shell'
import { SetupNotice } from '@/components/setup-notice'
import { isConfigured } from '@/lib/supabase/env'
import { loadAdmin } from '@/lib/session'
import { formatTender } from '@/lib/tender'

export const dynamic = 'force-dynamic'

/**
 * The operator console.
 *
 * What is NOT here is the point. No answers, no menu item titles, no letter
 * bodies, no reveal payloads. Every number comes from a SECURITY DEFINER function
 * that checks admin status inside the database and returns counts and account
 * metadata only.
 *
 * That is a product decision rather than a technical limit. Users are told
 * "neither of you sees anything until you both have" and "only you write this,
 * and only you price it". An operator able to read those would make both false
 * while nobody knew, and would turn any future breach or subpoena into a
 * disclosure of the most private thing this app holds. If moderating explicit
 * menu items becomes a real need, the answer is a report button surfacing the one
 * reported item — not a browsable index of everybody's.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  if (!isConfigured()) return <SetupNotice />

  const { q } = await searchParams
  const data = await loadAdmin(q)

  // Not an admin, or not signed in. Straight back to the app, with no hint that
  // there was anything here to find.
  if (!data) redirect('/')

  const { overview: o, retention, accounts, economy, nudges } = data
  const stuck = Number(nudges.claimed_unsent ?? 0)

  return (
    <AdminShell title="How it’s going" breadcrumb="Overview">
      <div className="stack" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        {/* ---- Overview ---- */}
        <section id="glance" className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
          <SectionHead
            title="At a glance"
            note="Counts and account metadata. Nothing anybody wrote — not answers, not menus, not letters."
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <Stat label="Accounts" value={o.users} />
            <Stat label="Confirmed" value={o.usersConfirmed} />
            <Stat label="Couples" value={o.pairsComplete} />
            <Stat label="Waiting" value={o.pairsPending} />
            <Stat label="Reveals today" value={o.revealsToday} />
            <Stat label="Reveals, 7d" value={o.reveals7d} />
            <Stat label="Signups, 7d" value={o.signups7d} />
            <Stat label="Signups, 30d" value={o.signups30d} />
          </div>
          <p className="t-small text-ink-faint">
            {o.usersAnonymous} unconfirmed{' '}
            {o.usersAnonymous === 1 ? 'account' : 'accounts'} — those cannot be
            recovered if the browser is lost. {o.pairsEnded} pairing
            {o.pairsEnded === 1 ? '' : 's'} ended.
          </p>
        </section>

        {/* ---- Accounts: the working surface, so it sits high ---- */}
        <section id="accounts" className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHead
              title="Accounts"
              note={`${accounts.length} shown, newest first. Open a row for the rest.`}
            />
            <form action="/admin" className="flex gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q ?? ''}
                placeholder="Search a name or address"
                className="min-h-[2.5rem] w-56 rounded-full border border-hairline bg-paper-raised px-4 text-[0.9375rem] text-ink placeholder:text-ink-faint"
              />
              <button
                type="submit"
                className="press t-label min-h-[2.5rem] shrink-0 rounded-full border border-hairline bg-paper-raised px-4 text-ink-muted hover:text-ink"
              >
                Search
              </button>
            </form>
          </div>

          <AdminAccounts accounts={accounts} />
        </section>

        {/* ---- Retention ---- */}
        <section id="retention" className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
          {/*
            The number that says whether the product works. A daily-ritual app
            lives or dies on how many couples are still here in week two, and
            everything else on this page is context for this row.
          */}
          <SectionHead
            title="Retention"
            note="Couples who have completed this many days — days you both answered, not days since signing up."
          />
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
            {retention.map((r) => (
              <Stat key={r.milestone} label={`${r.milestone} days`} value={r.pairs} />
            ))}
          </div>
        </section>

        {/* ---- Economy and Emails, side by side where there is room ---- */}
        <div className="grid gap-10 xl:grid-cols-2">
          <section id="economy" className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
            <SectionHead title="Economy" />
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Tender out there"
                value={`T${formatTender(Number(economy.tender_in_circulation ?? 0))}`}
              />
              <Stat label="Menu items" value={Number(economy.menu_items_active ?? 0)} />
              <Stat
                label="Average price"
                value={`T${formatTender(Number(economy.menu_price_avg ?? 0))}`}
              />
              <Stat label="Fulfilled" value={Number(economy.purchases_fulfilled ?? 0)} />
            </div>
            <p className="t-small text-ink-faint">
              {Number(economy.purchases_requested ?? 0)} request
              {Number(economy.purchases_requested ?? 0) === 1 ? '' : 's'} outstanding ·{' '}
              {Number(economy.purchases_declined ?? 0)} declined · {o.richListOptedIn}{' '}
              opted into the Rich List
            </p>
          </section>

          <section id="emails" className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
            <SectionHead title="Emails" />
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Sent today" value={Number(nudges.sent_today ?? 0)} />
              <Stat label="Sent, all time" value={Number(nudges.sent_total ?? 0)} />
              <Stat label="Stuck unsent" value={stuck} />
              <Stat label="Letters sealed" value={o.lettersSealed} />
            </div>
            {stuck > 0 ? (
              <div className="rounded-[0.75rem] border border-[var(--warning)]/45 bg-paper-sunken px-4 py-3">
                <p className="t-small text-ink">
                  {stuck} nudge{stuck === 1 ? '' : 's'} claimed but never sent — the
                  send failed after the claim. Check{' '}
                  <code className="font-mono">net._http_response</code> for what
                  Resend returned.
                </p>
              </div>
            ) : null}
            <p className="t-small text-ink-faint">
              Switched off: {Number(nudges.reminders_off ?? 0)} reminders,{' '}
              {Number(nudges.partner_off ?? 0)} partner,{' '}
              {Number(nudges.requests_off ?? 0)} requests
            </p>
          </section>
        </div>
      </div>
    </AdminShell>
  )
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div>
      <h2 className="t-title text-ink">{title}</h2>
      {note ? <p className="t-small mt-1 max-w-[44rem] text-ink-muted">{note}</p> : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[0.75rem] border border-hairline bg-paper-raised px-4 py-4">
      <p className="t-label">{label}</p>
      <p className="mt-1.5 font-serif text-[1.625rem] leading-none tracking-tight tabular text-ink">
        {value}
      </p>
    </div>
  )
}
