import Link from 'next/link'
import { ClaimEmail } from '@/components/claim-email'
import { EntryForm } from '@/components/entry-form'
import { InvitePanel } from '@/components/invite-panel'
import { SealedPreview } from '@/components/sealed-preview'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Card, Rule, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { formatCountdown } from '@/lib/sync/day'
import { loadHome, type HomeState } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (!isConfigured()) return <SetupNotice />

  const home = await loadHome()

  if (!home || !home.me.firstName) return <Welcome />
  if (!home.pair) return <NoPair />

  return <Hub home={home} />
}

/** First contact. No email, no password, no tour. */
function Welcome() {
  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <Wordmark size="lg" />

        <div className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
          <h1 className="t-question text-ink">
            One question a day.
            <br />
            Answered twice.
          </h1>
          <p className="t-body max-w-[20rem] text-ink-muted">
            Once honestly, for you. Once as a guess at what your person will say.
            Neither of you sees anything until you both have.
          </p>
        </div>

        <EntryForm />
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
  const { me, partner, invite, openDays, streak, secondsToRollover } = home

  const today = openDays.find((day) => !day.isGrace)
  const grace = openDays.find((day) => day.isGrace)

  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '2rem' }}>
        <header className="flex items-baseline justify-between gap-4">
          <Wordmark />
          {streak > 0 ? (
            <span className="t-label">
              {streak} day{streak === 1 ? '' : 's'}
            </span>
          ) : null}
        </header>

        {today ? <TodayCard home={home} day={today} /> : null}

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
            canRevoke
          />
        ) : null}

        {/* The email ask, once there is something to lose. Never a gate. */}
        {me.isAnonymous && (today?.answered || streak > 0) ? (
          <>
            <Rule />
            <Card>
              <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
                <p className="t-title text-ink">Keep this if you switch browsers.</p>
                <ClaimEmail reason="So your streak and answers survive a new phone or a cleared browser. We never email anything you've written." />
              </div>
            </Card>
          </>
        ) : null}

        <footer className="t-small pt-2 text-ink-faint">
          {today ? `Tomorrow’s question in ${formatCountdown(secondsToRollover)}.` : null}
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
