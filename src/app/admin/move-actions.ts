'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { loadAdmin } from '@/lib/session'
import { MOVE_EMAILS, plan, reachable, type MoveEmail, type Plan } from '@/lib/move-emails/compose'
import { emailsConfigured, sendAll, sendTest, standings } from '@/lib/move-emails/send'

export interface MoveEmailResult {
  ok?: true
  sent?: number
  error?: string
}

/** The plan for one email as it stands right now, for an admin only. */
async function current(email: MoveEmail): Promise<{ plan: Plan; adminEmail: string | null } | { error: string }> {
  if (!MOVE_EMAILS.includes(email)) return { error: 'There’s no email like that.' }
  if (!emailsConfigured()) return { error: 'Sending isn’t set up yet: add RESEND_API_KEY in Vercel.' }
  // loadAdmin checks admin status inside the database first.
  const data = await loadAdmin()
  if (!data) return { error: 'Not permitted.' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  try {
    const s = await standings(reachable(data.accounts).map((p) => p.id))
    return { plan: plan(email, data.accounts, s), adminEmail: user?.email ?? null }
  } catch {
    return { error: 'Couldn’t reach the new app to check who has moved. Try again in a minute.' }
  }
}

/** A copy of the first person's email, to the founder's own address. */
export async function sendMoveEmailTest(email: MoveEmail): Promise<MoveEmailResult> {
  const c = await current(email)
  if ('error' in c) return { error: c.error }
  if (!c.adminEmail) return { error: 'Your account has no email to send a test to.' }
  const sample = c.plan.letters[0]
  if (!sample) return { error: 'Nobody is waiting for this email, so there’s nothing to test.' }
  try {
    await sendTest(sample, c.adminEmail)
    return { ok: true, sent: 1 }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'The test didn’t send.' }
  }
}

/**
 * Sends one email to everyone still waiting for it. `expected` is the count
 * the founder saw: if the list has changed since, nothing goes, so what they
 * agreed to is what happens.
 */
export async function sendMoveEmails(email: MoveEmail, expected: number): Promise<MoveEmailResult> {
  const c = await current(email)
  if ('error' in c) return { error: c.error }
  const n = c.plan.letters.length
  if (n === 0) return { error: 'Everyone has had this email already.' }
  if (n !== expected) {
    return { error: `The list changed since the page loaded: it’s now ${n} ${n === 1 ? 'person' : 'people'}. Reload to check, then send.` }
  }
  try {
    const sent = await sendAll(email, c.plan.letters)
    revalidatePath('/admin')
    return { ok: true, sent }
  } catch (e) {
    revalidatePath('/admin')
    return { error: `${e instanceof Error ? e.message : 'Sending stopped.'} Reload to see who still needs it; pressing Send again only reaches them.` }
  }
}
