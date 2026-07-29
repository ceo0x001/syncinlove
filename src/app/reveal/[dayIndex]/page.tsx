import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { RevealView } from '@/components/reveal-view'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Notice, Screen, Wordmark } from '@/components/ui'
import { questionForDay } from '@/lib/questions/bank'
import type { AnswerPayload } from '@/lib/questions/types'
import { isConfigured } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'
import { loadHome } from '@/lib/session'

export const dynamic = 'force-dynamic'

interface RevealSide {
  user_id: string
  self: AnswerPayload
  guess: AnswerPayload
}

interface RevealPayload {
  a: RevealSide
  b: RevealSide
  a_read_b: { total: number }
  b_read_a: { total: number }
}

export default async function RevealPage({
  params,
}: {
  params: Promise<{ dayIndex: string }>
}) {
  if (!isConfigured()) return <SetupNotice />

  const [{ dayIndex: raw }, home] = await Promise.all([params, loadHome()])

  const dayIndex = Number(raw)
  if (!Number.isInteger(dayIndex) || dayIndex < 0) notFound()

  if (!home || !home.me.firstName) redirect('/')
  if (!home.pair) redirect('/')

  const supabase = await createClient()
  const { data: reveal } = await supabase
    .from('reveals')
    .select('day_index, sync_score, payload')
    .eq('pair_id', home.pair.id)
    .eq('day_index', dayIndex)
    .maybeSingle()

  // No reveal means the second answer hasn't landed. Deliberately says nothing
  // about whether the partner has answered — that belongs on the home screen,
  // where it reads as a nudge rather than as a leak from a locked page.
  if (!reveal) {
    return (
      <Screen>
        <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
          <Wordmark />
          <h1 className="t-question text-ink">Not open yet.</h1>
          <Notice>This one opens when you have both answered.</Notice>
          <Link href="/" className="block">
            <Button variant="quiet">Back</Button>
          </Link>
        </div>
      </Screen>
    )
  }

  const payload = reveal.payload as RevealPayload
  const mine = payload.a.user_id === home.me.id ? payload.a : payload.b
  const theirs = payload.a.user_id === home.me.id ? payload.b : payload.a
  const iReadThem =
    payload.a.user_id === home.me.id ? payload.a_read_b.total : payload.b_read_a.total
  const theyReadMe =
    payload.a.user_id === home.me.id ? payload.b_read_a.total : payload.a_read_b.total

  // The streak as it stood on this day, so revisiting an old reveal doesn't
  // retroactively claim a number that hadn't been earned yet.
  const streakThen = streakAsOf(home.completedDays, dayIndex)

  // What this day actually paid, read from the ledger rather than recomputed —
  // the entry is the record, and a formula change later must not rewrite history.
  const { data: entry } = await supabase
    .from('tender_entries')
    .select('amount')
    .eq('pair_id', home.pair.id)
    .eq('user_id', home.me.id)
    .eq('day_index', dayIndex)
    .eq('reason', 'reveal')
    .maybeSingle()

  const earned = entry ? Number(entry.amount) : null

  return (
    <Screen>
      <RevealView
        question={questionForDay(dayIndex)}
        dayIndex={dayIndex}
        syncScore={reveal.sync_score}
        streak={streakThen}
        myFirstName={home.me.firstName}
        theirFirstName={home.partner?.firstName ?? 'They'}
        myTruth={mine.self}
        myGuess={mine.guess}
        theirTruth={theirs.self}
        theirGuess={theirs.guess}
        iReadThem={iReadThem}
        theyReadMe={theyReadMe}
        earned={earned}
      />
    </Screen>
  )
}

/** Consecutive completed days ending at `dayIndex`. */
function streakAsOf(completedDays: number[], dayIndex: number): number {
  const done = new Set(completedDays)
  if (!done.has(dayIndex)) return 0

  let streak = 0
  let cursor = dayIndex
  while (cursor >= 0 && done.has(cursor)) {
    streak++
    cursor--
  }
  return streak
}
