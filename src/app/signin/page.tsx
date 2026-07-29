import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SetupNotice } from '@/components/setup-notice'
import { SignInForm } from '@/components/signin-form'
import { Notice, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { getMe } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>
}) {
  if (!isConfigured()) return <SetupNotice />

  const { problem } = await searchParams

  // Somebody already signed in properly has nothing to do here.
  const me = await getMe()
  if (me && !me.isAnonymous) redirect('/')

  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <Wordmark size="lg" />

        <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
          <h1 className="t-question text-ink">Welcome back.</h1>
          <p className="t-body max-w-[22rem] text-ink-muted">
            Put in the email on your account and we&rsquo;ll send you a code. No
            password — there never was one.
          </p>
        </div>

        {/* Set by /auth/callback when a link couldn't be honoured. Saying why
            beats silently showing a signup form, which is what happened before. */}
        {problem ? <Notice tone="error">{problem}</Notice> : null}

        <SignInForm />

        <div className="stack" style={{ ['--stack-gap' as string]: '0.75rem' }}>
          <p className="t-small text-ink-faint">
            If nothing arrives, the address may never have been confirmed. An
            account whose email was never confirmed can&rsquo;t be signed into —
            there&rsquo;s no way to prove it belongs to you. Ask your partner to
            send you a fresh invite link and start again.
          </p>
          <Link href="/" className="t-small text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink">
            Start a new account instead
          </Link>
        </div>
      </div>
    </Screen>
  )
}
