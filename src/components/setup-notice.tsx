import { Card, Screen, Wordmark } from './ui'

/** Shown instead of a stack trace when the app hasn't been pointed at Supabase. */
export function SetupNotice() {
  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '1.5rem' }}>
        <Wordmark />
        <h1 className="t-question text-ink">Nearly there.</h1>
        <p className="t-body text-ink-muted">
          Sync needs a Supabase project before it can run. Three steps, about five
          minutes.
        </p>

        <Card>
          <ol className="stack t-body text-ink-muted" style={{ ['--stack-gap' as string]: '1rem' }}>
            <li>
              <strong className="text-ink">1. Create the project.</strong> At
              supabase.com/dashboard. Then open Project Settings → API and copy the
              Project URL and the anon / publishable key into{' '}
              <code className="font-mono text-[0.8125rem]">.env.local</code>.
            </li>
            <li>
              <strong className="text-ink">2. Turn on anonymous sign-ins.</strong>{' '}
              Authentication → Sign In / Providers → Anonymous sign-ins. This is what
              lets an invited partner answer before making an account.
            </li>
            <li>
              <strong className="text-ink">3. Run the SQL.</strong> Paste{' '}
              <code className="font-mono text-[0.8125rem]">
                supabase/migrations/0001_phase1_loop.sql
              </code>{' '}
              then{' '}
              <code className="font-mono text-[0.8125rem]">
                supabase/seed/questions.sql
              </code>{' '}
              into the SQL editor.
            </li>
          </ol>
        </Card>

        <p className="t-small text-ink-faint">
          Restart the dev server after editing{' '}
          <code className="font-mono">.env.local</code> — Next only reads it at boot.
        </p>
      </div>
    </Screen>
  )
}
