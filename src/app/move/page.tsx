import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button, Screen, Wordmark } from '@/components/ui'
import { moveConfigured, myMove, newSyncUrl } from '@/lib/move'
import { bringMyAccount } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Bringing your account to the new Sync in Love: one tap, then where you stand.
 * A couple moves when both have tapped, so the waiting state names who to nudge.
 */
export default async function MovePage({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  if (!moveConfigured()) redirect('/')
  const move = await myMove()
  if (!move) redirect('/')
  const { failed } = await searchParams
  const them = move.partner ?? 'your partner'

  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
        <Wordmark />
        {move.state === 'moved' ? (
          <>
            <h1 className="t-question text-ink">You&rsquo;re in the new Sync in Love.</h1>
            <p className="t-body text-ink-muted">
              Your streak, your history, your Tender and your letters are there. Sign in with the
              same email.
            </p>
            <a href={newSyncUrl()} className="block">
              <Button>Open the new Sync in Love</Button>
            </a>
          </>
        ) : move.state === 'waiting' ? (
          <>
            <h1 className="t-question text-ink">Done. Now {them}.</h1>
            <p className="t-body text-ink-muted">
              Your side is ready. The two of you move together as soon as {them} taps{' '}
              <span className="text-ink">Bring my account</span> on their phone too.
            </p>
            <p className="t-small text-ink-faint">
              Until then, keep playing here. Anything you do now comes across with you.
            </p>
          </>
        ) : move.state === 'held_back' ? (
          <>
            <h1 className="t-question text-ink">Nearly there.</h1>
            <p className="t-body text-ink-muted">
              You and {them} have both sent yours, and something needs a closer look before your
              history moves. We&rsquo;ll be in touch. Keep playing here until then.
            </p>
          </>
        ) : move.state === 'left_behind' ? (
          <>
            <h1 className="t-question text-ink">Add an email first.</h1>
            <p className="t-body text-ink-muted">
              Your account moves by its email, and this one doesn&rsquo;t have a confirmed one yet.
              Add it from your home screen, then come back here.
            </p>
            <Link href="/" className="block">
              <Button variant="quiet">Back home</Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="t-question text-ink">Sync in Love is moving.</h1>
            <p className="t-body text-ink-muted">
              There&rsquo;s a new Sync in Love, and your account can come with you: your streak,
              every day you&rsquo;ve answered, your Tender, your Menu and your letters.
            </p>
            <p className="t-body text-ink-muted">
              Tap once here. If you&rsquo;re a couple, your partner taps on their phone too, and you
              move together.
            </p>
            <form action={bringMyAccount}>
              <Button type="submit">Bring my account</Button>
            </form>
            <p className="t-small text-ink-faint">
              Letters stay sealed until their day. Your first sign-in there asks whether to keep
              your account or delete everything.
            </p>
          </>
        )}
        {failed ? (
          <p className="t-small text-error" role="alert">
            That didn&rsquo;t go through. Check your connection and try again.
          </p>
        ) : null}
        <Link href="/" className="t-small text-ink-muted underline">
          Back to today
        </Link>
      </div>
    </Screen>
  )
}
