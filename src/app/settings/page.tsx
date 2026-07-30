import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClaimEmail } from '@/components/claim-email'
import { SetupNotice } from '@/components/setup-notice'
import {
  BurnForm,
  EndPairingForm,
  ExportButton,
  ProfileForm,
  SignOutForm,
} from '@/components/settings-forms'
import { Button, Card, NavLink, Rule, Screen, Wordmark } from '@/components/ui'
import { isConfigured } from '@/lib/supabase/env'
import { loadHome } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  if (!isConfigured()) return <SetupNotice />

  const home = await loadHome()
  if (!home || !home.me.firstName) redirect('/')

  const { me, partner } = home
  const them = partner?.firstName ?? 'your partner'

  return (
    <Screen>
      <div className="stack stagger" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <header className="flex items-baseline justify-between gap-4">
          <Wordmark />
          <NavLink href="/">Today</NavLink>
        </header>

        <h1 className="t-question text-ink">You</h1>

        <ProfileForm me={me} />

        {me.isAnonymous ? (
          <>
            <Rule />
            <Card>
              <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
                <p className="t-title text-ink">This account isn’t secured yet.</p>
                <p className="t-body text-ink-muted">
                  Until the address is confirmed, losing this browser loses
                  everything — there&rsquo;s no way to prove an unconfirmed account
                  belongs to you.
                </p>
                <ClaimEmail
                  pendingEmail={me.pendingEmail}
                  reason="So your streak and answers survive a new phone or a cleared browser."
                />
                {/* Kept inside the unsecured card, next to the thing that makes
                    it safe, rather than filed away as a neutral option. */}
                <SignOutForm secured={false} />
              </div>
            </Card>
          </>
        ) : (
          <>
            <Rule />
            <div className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
              <div className="stack" style={{ ['--stack-gap' as string]: '0.5rem' }}>
                <p className="t-label">Signed in as</p>
                <p className="t-body text-ink">{me.email}</p>
              </div>
              <SignOutForm secured />
            </div>
          </>
        )}

        <Rule />

        <section className="stack" style={{ ['--stack-gap' as string]: '1rem' }}>
          <div>
            <h2 className="t-title text-ink">Your copy of everything</h2>
            <p className="t-small mt-1 text-ink-muted">
              Every reveal, your own answers, your tender, your menu, and the
              letters you&rsquo;re entitled to — as one file. Sealed letters
              addressed to you are listed but not opened; leaving isn&rsquo;t a way
              to read early what you were never shown.
            </p>
          </div>
          <ExportButton />
        </section>

        <Rule />

        {/* The exits. Clearly marked, hard to trip over. */}
        <section className="stack" style={{ ['--stack-gap' as string]: '1.25rem' }}>
          <div>
            <h2 className="t-title text-ink">Ending things</h2>
            <p className="t-small mt-1 text-ink-muted">
              One rule worth knowing before you need it:{' '}
              <strong className="text-ink">
                you can always delete what you wrote and your own account, and you
                can never delete what your partner wrote.
              </strong>{' '}
              Shared history is jointly authored.
            </p>
          </div>

          {partner ? <EndPairingForm partnerFirstName={them} /> : null}

          <BurnForm canBurn={!me.isAnonymous} />
        </section>

        <Rule />

        <Link href="/" className="block pb-4">
          <Button variant="quiet">Back to today</Button>
        </Link>
      </div>
    </Screen>
  )
}
