import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AnswerFlow } from '@/components/answer-flow'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Notice, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { loadHome } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>
}) {
  if (!isConfigured()) return <SetupNotice />

  const [{ day: dayParam }, home] = await Promise.all([searchParams, loadHome()])

  if (!home || !home.me.firstName) redirect('/')
  if (!home.pair) redirect('/')

  // Default to the freshest open day; `?day=` targets the one still in grace.
  const requested = dayParam === undefined ? undefined : Number(dayParam)
  const target =
    requested !== undefined && Number.isInteger(requested)
      ? home.openDays.find((d) => d.dayIndex === requested)
      : home.openDays.find((d) => !d.isGrace)

  if (!target) {
    return (
      <Screen>
        <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
          <Wordmark />
          <h1 className="t-question text-ink">That one has closed.</h1>
          <Notice>
            Questions stay open for 30 hours — through the night and six hours past the
            next morning — so a late answer still counts. This one is past that.
          </Notice>
          <Link href="/" className="block">
            <Button variant="quiet">Back to today</Button>
          </Link>
        </div>
      </Screen>
    )
  }

  // Already submitted. Answers are immutable, so there is nothing to return to.
  if (target.answered) {
    redirect(target.revealed ? `/reveal/${target.dayIndex}` : '/')
  }

  return (
    <Screen>
      <AnswerFlow
        question={target.question}
        dayIndex={target.dayIndex}
        partnerFirstName={home.partner?.firstName ?? null}
        partnerAnswered={target.partnerAnswered}
        isGrace={target.isGrace}
      />
    </Screen>
  )
}
