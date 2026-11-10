import Link from 'next/link'
import { Button, Screen, Wordmark } from './ui'

/**
 * The front door once Sync in Love has moved (MOVED_TO in Vercel).
 *
 * Signed in, this only shows to someone who has moved: anyone who hasn't is
 * sent to Bring my account first. Signed out, nobody knows yet whether the
 * visitor moved, so the way to move comes first (signing in leads straight to
 * Bring my account), and anyone who already has taps through.
 */
export function Moved({ url, signedIn }: { url: string; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <Screen>
        <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
          <Wordmark />
          <h1 className="t-question text-ink">Sync in Love has moved.</h1>
          <p className="t-body text-ink-muted">
            Sign in here first to bring your streak, Tender and letters with you.
          </p>
          <Link href="/signin" className="block">
            <Button>Sign in to bring my account</Button>
          </Link>
          <a href={url} className="block">
            <Button variant="quiet">Already moved? Open the new one</Button>
          </a>
          {/* The closing date is set in the new app (pnpm move:close there); change this with it. */}
          <p className="t-small text-ink-faint">Open until 17 November.</p>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
        <Wordmark />
        <h1 className="t-question text-ink">Sync in Love has moved.</h1>
        <p className="t-body text-ink-muted">
          Your account, your streak, your Tender and your letters came with you. Sign in
          there with the same email.
        </p>
        <a href={url} className="block">
          <Button>Open the new Sync in Love</Button>
        </a>
        <p className="t-small text-ink-faint">
          This app is read-only now. You can still look back at your history here for a
          little while.
        </p>
        <Link href="/history" className="block">
          <Button variant="quiet">Your history</Button>
        </Link>
      </div>
    </Screen>
  )
}
