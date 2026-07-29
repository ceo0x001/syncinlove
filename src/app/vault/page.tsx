import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SetupNotice } from '@/components/setup-notice'
import { Button, Rule, Screen, Wordmark } from '@/components/ui'
import { Vault, type OpenLetter, type SealedForMe } from '@/components/vault'
import { isConfigured } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'
import { loadHome } from '@/lib/session'
import { addDays, localParts } from '@/lib/sync/day'

export const dynamic = 'force-dynamic'

export default async function VaultPage() {
  if (!isConfigured()) return <SetupNotice />

  const home = await loadHome()
  if (!home || !home.me.firstName) redirect('/')
  if (!home.pair) redirect('/')

  const supabase = await createClient()

  const [openRes, sealedRes, vaultOpenRes, daysRes] = await Promise.all([
    // RLS returns only what this person may legitimately read: letters they
    // wrote, and letters to them whose date has arrived while still paired. A
    // sealed letter's row is simply not selectable.
    supabase
      .from('letters')
      .select('id, title, body, unlock_on, opened_at, sender_id')
      .eq('pair_id', home.pair.id)
      .order('unlock_on', { ascending: false }),
    supabase.rpc('sealed_for_me'),
    supabase.rpc('vault_open'),
    supabase.rpc('completed_days', { p_pair_id: home.pair.id }),
  ])

  const letters: OpenLetter[] = (openRes.data ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    body: l.body,
    unlockOn: l.unlock_on,
    opened: l.opened_at !== null,
    fromMe: l.sender_id === home.me.id,
  }))

  const sealedForMe = (sealedRes.data ?? []) as SealedForMe[]
  const them = home.partner?.firstName ?? 'your partner'

  // Tomorrow in the pair's timezone — the same clock seal_letter validates on.
  const minUnlockOn = addDays(localParts(new Date(), home.pair.timeZone).date, 1)

  return (
    <Screen>
      <div className="stack" style={{ ['--stack-gap' as string]: '2.5rem' }}>
        <header className="flex items-baseline justify-between gap-4">
          <Wordmark />
          <Link href="/" className="t-small text-ink-muted hover:text-ink">
            Today
          </Link>
        </header>

        <div>
          <h1 className="t-question text-ink">The vault</h1>
          <p className="t-body mt-2 text-ink-muted">
            Letters sealed until a date you choose. Once sealed you can&rsquo;t edit
            one or take it back — and whoever receives it can refuse it without
            reading it.
          </p>
        </div>

        <Vault
          open={Boolean(vaultOpenRes.data)}
          daysTogether={Number(daysRes.data ?? 0)}
          sealedForMe={sealedForMe}
          letters={letters}
          partnerFirstName={them}
          canSeal={!home.me.isAnonymous}
          minUnlockOn={minUnlockOn}
        />

        <Rule />

        <Link href="/" className="block pb-4">
          <Button variant="quiet">Back to today</Button>
        </Link>
      </div>
    </Screen>
  )
}
