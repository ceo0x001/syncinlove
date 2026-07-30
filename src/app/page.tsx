import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClaimEmail } from '@/components/claim-email'
import { EntryForm } from '@/components/entry-form'
import { HowItWorks } from '@/components/how-it-works'
import { InvitePanel } from '@/components/invite-panel'
import { SealedPreview } from '@/components/sealed-preview'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Card, NavLink, Rule, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { formatCountdown } from '@/lib/sync/day'
import { loadHome, type Economy, type HomeState } from '@/lib/session'
import { SUPPORT_URL } from '@/lib/support'
import { settleOpenDays } from '@/app/actions'
import { tender } from '@/lib/tender'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (!isConfigured()) return <SetupNotice />

  // Pays the completion floor for any day answered alone whose window has closed,
  // so a silent partner never costs the person who showed up everything. No cron
  // in this app — a page load is the only trigger needed, and it's idempotent.
  await settleOpenDays()

  const home = await loadHome()

  if (!home || !home.me.firstName) return <Welcome />

  // Admins see the panel and nothing else, which is what was asked for. Worth
  // knowing the consequence: an account with admin cannot reach its own daily
  // question, so admin work wants its own account rather than a personal one.
  if (home.me.isAdmin) redirect('/admin')

  // Writing is already blocked in the database, so this exists to say why rather
  // than to enforce anything. Failing silently at the submit button would leave
  // somebody thinking the app was broken.
  if (home.me.suspendedAt) return <Suspended me={home.me} />

  if (!home.pair) return <NoPair />

  return <Hub home={home} />
}

function CoinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.75 14.5c0 .97 1 1.5 2.25 1.5s2.25-.6 2.25-1.55c0-1.95-4.5-.85-4.5-2.9 0-.95 1-1.55 2.25-1.55s2.25.53 2.25 1.5" />
      <path d="M12 8.25v1M12 15v1" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.75l3.25 1.9" />
    </svg>
  )
}

/** First contact. No email, no password, no tour. */
function Welcome() {
  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        {/*
          The wordmark used to sit alone here. It now shares a row with the way in
          to the explanation, because people were arriving, reading a promise, and
          having nowhere to go to find out what the promise involved.

          items-start rather than items-center: the lg wordmark is a two-line
          lockup and centring against it drops the button into the middle of the
          screen's left edge, away from the corner where it is being looked for.
        */}
        <header className="flex items-start justify-between gap-3">
          <span className="shrink-0">
            <Wordmark size="lg" />
          </span>
          <HowItWorks />
        </header>

        <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
          <h1 className="t-question text-ink">Find out if they really know you.</h1>
          <p className="t-body max-w-[26rem] text-ink-muted">
            One question a day.
            <br />
            You answer, then guess theirs.
            <br />
            Guess right and earn tender.
            <br />
            Spend it on their menu — the small things they&rsquo;ve already told
            you they love.
          </p>
          <div className="flex items-center gap-2 t-small text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <CoinIcon /> Free
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon /> 30 seconds a day
            </span>
          </div>
        </div>

        <EntryForm />

        <p className="t-small text-ink-muted">
          Been here before?{' '}
          <Link
            href="/signin"
            className="text-ink underline decoration-hairline-strong underline-offset-4"
          >
            Sign in with your email
          </Link>
        </p>
      </div>
    </Screen>
  )
}

/**
 * A suspended account.
 *
 * Reading stays open on purpose — the history, and the export. Suspension is
 * meant to stop somebody, not to confiscate what they already wrote, and the
 * export is the one thing this app promises unconditionally.
 */
function Suspended({ me }: { me: import('@/lib/session').Me }) {
  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
        <Wordmark />
        <h1 className="t-question text-ink">This account is on hold.</h1>
        <p className="t-body text-ink-muted">
          {me.suspendedReason
            ? `The reason given: ${me.suspendedReason}.`
            : 'No reason was recorded.'}{' '}
          You can still read everything you and your person have already done, and
          you can still download your copy of it — nothing has been taken away.
          What you can&rsquo;t do for now is answer, write a menu or seal a letter.
        </p>
        <p className="t-small text-ink-faint">
          If you think this is a mistake, reply to any email from us or get in
          touch and we&rsquo;ll look at it.
        </p>
        <Link href="/settings" className="block">
          <Button variant="quiet">Your settings and export</Button>
        </Link>
      </div>
    </Screen>
  )
}

/** Recoverable edge case: a profile exists but pair creation didn't land. */
function NoPair() {
  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
        <Wordmark />
        <h1 className="t-question text-ink">Let’s set your pairing up.</h1>
        <p className="t-body text-ink-muted">
          Something interrupted this the first time. Picking a name again will finish it.
        </p>
        <EntryForm />
      </div>
    </Screen>
  )
}

function Hub({ home }: { home: HomeState }) {
  const { me, partner, invite, openDays, streak, secondsToRollover, economy, completedDays } = home

  const today = openDays.find((day) => !day.isGrace)
  const grace = openDays.find((day) => day.isGrace)

  return (
    <Screen>
      {/* Staggered so the screen assembles rather than appearing all at once —
          the same grammar as the reveal, at a fraction of the intensity. */}
      <div className="stack stagger" style={{ ['--stack-gap' as string]: '2rem' }}>
        {/*
          Six things wanted this row and only about 327px exists on a 375px
          phone, so it wrapped to two lines once "You" became "Settings".

          What gives is the balance chip, and only below 420px. It is the one
          item here that is genuinely redundant: MenuSummary states the balance
          in full a few blocks down this same screen ("You have T40,000 to spend
          on their menu"), so hiding it costs nothing. Dropping History or List
          instead would remove the only route to those pages, and shrinking the
          chips below 44px would trade a layout problem for a touch-target one.
        */}
        <header className="flex items-center justify-between gap-3">
          {/* shrink-0 or flex squeezes the lockup to make room for the chips,
              which looks like a rendering fault rather than a tight layout. */}
          <span className="shrink-0">
            <Wordmark />
          </span>

          <nav className="flex items-center gap-1.5">
            {/* The balance is the one chip that duplicates something already on
                this screen — MenuSummary states it in full below — so it is the
                one that goes when the row runs out of room. Hidden via a wrapper
                rather than `hidden` on the chip itself: both are display
                utilities, and Tailwind's source order let inline-flex win, so the
                chip stayed visible and I measured a layout I had not built. */}
            {economy && partner ? (
              <span className="hidden min-[480px]:contents">
                <NavLink href="/menu" tone="accent">
                  <span className="tabular">{tender(economy.mine.balance)}</span>
                </NavLink>
              </span>
            ) : null}
            {partner ? <NavLink href="/history">History</NavLink> : null}
            {partner ? <NavLink href="/rich-list">List</NavLink> : null}
            <NavLink href="/settings">Settings</NavLink>
          </nav>
        </header>

        {today ? <TodayCard home={home} day={today} /> : null}

        {/* The menu ask. Withheld until there is unspent tender sitting there,
            because at signup it reads as homework and here it reads as an itch. */}
        {economy?.shouldPromptMenu && partner ? (
          <>
            <Rule />
            <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
              <p className="t-label">You’ve got tender</p>
              <h2 className="t-question text-ink">
                {tender(economy.mine.balance)}, and nothing to spend it on.
              </h2>
              <p className="t-body text-ink-muted">
                Tender only buys things off {partner.firstName}’s menu — and they can
                only spend on yours. Write down a few things you’re actually willing
                to do, and put your own price on each.
              </p>
              <Link href="/menu" className="block">
                <Button>Write my menu</Button>
              </Link>
            </div>
          </>
        ) : null}

        {economy && partner && !economy.shouldPromptMenu ? (
          <>
            <Rule />
            <MenuSummary economy={economy} partnerFirstName={partner.firstName} />
          </>
        ) : null}

        {grace && !grace.answered ? (
          <>
            <Rule />
            <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
              <p className="t-label">Still open</p>
              <p className="t-body text-ink-muted">
                Yesterday’s question hasn’t closed yet. Answer it and the day still
                counts.
              </p>
              <Link href={`/today?day=${grace.dayIndex}`} className="block">
                <Button variant="quiet">Answer yesterday’s</Button>
              </Link>
            </div>
          </>
        ) : null}

        {!partner && invite ? (
          <>
            <Rule />
            <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
              <p className="t-label">Waiting on your person</p>
              <InvitePanel
                url={invite.url}
                partnerFirstName={null}
                claimed={invite.claimed}
                expired={invite.expired}
                canRevoke={invite.canRevoke}
              />
            </div>
          </>
        ) : null}

        {partner && invite?.canRevoke ? (
          <InvitePanel
            url={invite.url}
            partnerFirstName={partner.firstName}
            claimed
            expired={false}
            canRevoke
          />
        ) : null}

        {/* Persistent, not a one-time card.
            A dismissible card is exactly what somebody skipped before losing an
            account outright — an anonymous session is unrecoverable, so this stays
            on screen until the code is entered. */}
        {me.isAnonymous ? (
          <>
            <Rule />
            <Card>
              <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
                <p className="t-title text-ink">
                  {me.pendingEmail
                    ? 'One step left to secure this account.'
                    : 'Add an email so this account is yours to keep.'}
                </p>
                <p className="t-body text-ink-muted">
                  Until you confirm it, losing this browser loses everything —
                  there&rsquo;s no way to prove an unconfirmed account is yours.
                </p>
                <ClaimEmail
                  pendingEmail={me.pendingEmail}
                  reason="So your streak and answers survive a new phone or a cleared browser. We never email anything you've written."
                />
              </div>
            </Card>
          </>
        ) : null}

        {partner ? (
          <>
            <Rule />
            <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
              <p className="t-label">The vault</p>
              <p className="t-body text-ink-muted">
                {completedDays.length >= 30
                  ? 'Letters sealed until a date you choose.'
                  : `Opens after 30 days together. You’re at ${completedDays.length}.`}
              </p>
              <Link href="/vault" className="block">
                <Button variant="quiet">
                  {completedDays.length >= 30 ? 'Open the vault' : 'Look inside'}
                </Button>
              </Link>
            </div>
          </>
        ) : null}

        {/* Quiet, but on every visit to the dashboard. Feedback that needs
            hunting for never arrives. */}
        <footer
          className="stack t-small pt-2 text-ink-faint"
          style={{ ['--stack-gap' as string]: '0.5rem' }}
        >
          {/*
            The streak used to sit in the header as plain text among the nav
            chips, which made it the odd one out — the header's rule is that a
            chip is somewhere you can go, and a streak is not. Moving it here
            also gave the row the ~36px it needed to stop wrapping, and it reads
            better next to the countdown: both are about where you are in the
            day rather than where you can navigate to.
          */}
          {streak > 0 || today ? (
            <p>
              {streak > 0 ? (
                <>
                  <span className="tabular text-ink-muted">{streak}</span> day
                  {streak === 1 ? '' : 's'} in a row
                  {today ? ' · ' : '.'}
                </>
              ) : null}
              {today ? `Tomorrow’s question in ${formatCountdown(secondsToRollover)}.` : null}
            </p>
          ) : null}
          {/*
            Here rather than in the header nav. That row already ran out of room at
            375px once — it is why the balance chip hides below 480px — and a fifth
            chip would put it straight back onto two lines. Somebody who needs the
            explanation on day nine is looking for help, and this is where the
            other help already is.
          */}
          {/*
            A div, not a <p>. HowItWorks renders its <dialog> as a sibling of the
            trigger, and <dialog> is flow content — inside a paragraph the HTML
            parser closes the <p> before it, so the server's markup and React's
            client tree disagree and hydration warns.
          */}
          <div>
            <HowItWorks variant="quiet" />
          </div>

          <p>
            Something broken, missing, or worth saying?{' '}
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink"
            >
              Message us on WhatsApp
            </a>
          </p>
        </footer>
      </div>
    </Screen>
  )
}

function TodayCard({ home, day }: { home: HomeState; day: HomeState['openDays'][number] }) {
  const { partner } = home
  const them = partner?.firstName ?? null

  if (day.revealed) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
        <p className="t-label">Today</p>
        <h1 className="t-question text-ink">{day.question.prompt}</h1>
        <p className="t-body text-ink-muted">You both answered. It’s open.</p>
        <Link href={`/reveal/${day.dayIndex}`} className="block">
          <Button>See today’s reveal</Button>
        </Link>
      </div>
    )
  }

  if (day.answered) {
    return (
      <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
        <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
          <p className="t-label">Sealed</p>
          <h1 className="t-question text-ink">{day.question.prompt}</h1>
          <p className="t-body text-ink-muted">
            {them
              ? `Your answers are in. Waiting on ${them}.`
              : 'Your answers are in. They’ll open the moment your person answers.'}
          </p>
        </div>

        <SealedPreview question={day.question} partnerFirstName={them} />
      </div>
    )
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
      <p className="t-label">Today</p>
      <h1 className="t-question text-ink">{day.question.prompt}</h1>

      {day.partnerAnswered && them ? (
        <p className="t-body text-ink-muted">{them} has already answered.</p>
      ) : (
        <p className="t-body text-ink-muted">
          Answer it twice — once for you, once as {them ?? 'your person'}.
        </p>
      )}

      <Link href={`/today?day=${day.dayIndex}`} className="block">
        <Button>Answer today’s question</Button>
      </Link>
    </div>
  )
}

/**
 * A quiet line about the economy once it's running.
 *
 * Shows outstanding requests either way, because an unfulfilled ask sitting
 * visible is the entire enforcement mechanism — there are no timers and nothing
 * ever goes overdue.
 */
function MenuSummary({
  economy,
  partnerFirstName,
}: {
  economy: Economy
  partnerFirstName: string
}) {
  const owedByThem = economy.purchases.filter(
    (p) => p.status === 'requested' && p.iBought,
  ).length
  const owedByMe = economy.purchases.filter(
    (p) => p.status === 'requested' && !p.iBought,
  ).length

  return (
    <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
      <p className="t-label">Tender</p>

      <p className="t-body text-ink-muted">
        You have <span className="tabular text-ink">{tender(economy.mine.balance)}</span> to
        spend on {partnerFirstName}&rsquo;s menu.
        {economy.needsMoreItems > 0
          ? ` Write ${economy.needsMoreItems} more thing${economy.needsMoreItems === 1 ? '' : 's'} on yours to unlock spending.`
          : ''}
      </p>

      {owedByMe > 0 ? (
        <p className="t-body text-ink">
          {owedByMe} thing{owedByMe === 1 ? '' : 's'} {partnerFirstName} has asked you
          for. Whenever you like — there&rsquo;s no clock on it.
        </p>
      ) : null}

      {owedByThem > 0 ? (
        <p className="t-small text-ink-muted">
          {owedByThem} thing{owedByThem === 1 ? '' : 's'} you&rsquo;ve asked for, not
          marked done yet.
        </p>
      ) : null}

      <Link href="/menu" className="block">
        <Button variant="quiet">Menus and tender</Button>
      </Link>
    </div>
  )
}
