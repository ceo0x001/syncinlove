import 'server-only'
import { createHash } from 'node:crypto'
import { moveConfigured, signedCall } from '@/lib/move'
import type { Letter, MoveEmail, Standing } from './compose'

/**
 * Sending the move emails through Resend, and asking the new app who has
 * moved and who already had which email.
 *
 * RESEND_API_KEY is a send-only key the founder makes in Resend and sets in
 * this app's Vercel project. Until it's there, the admin page shows the emails
 * but can't send them.
 */

const FROM = 'Sync in Love <noreply@syncin.love>'
const KEY = process.env.RESEND_API_KEY

export function emailsConfigured(): boolean {
  return Boolean(KEY && moveConfigured())
}

/** Where each old account stands. With `sent`, those accounts are first marked as having had that email. */
export async function standings(ids: string[], sent?: MoveEmail): Promise<Record<string, Standing>> {
  if (ids.length === 0) return {}
  return signedCall<Record<string, Standing>>('old_app_move_emails', { kind: 'move_emails', ids, ...(sent ? { sent } : {}) })
}

function message(l: Letter, test = false) {
  return {
    from: FROM,
    to: [l.to],
    subject: test ? `[Test] ${l.subject}` : l.subject,
    html: l.html,
    text: l.text,
  }
}

async function resend(path: string, body: unknown, idempotencyKey: string): Promise<void> {
  const res = await fetch(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      // The same request twice within a day sends once, so a double tap or a
      // retry can't mail anyone twice.
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null
    throw new Error(`Resend answered ${res.status}${detail?.message ? `: ${detail.message}` : ''}`)
  }
}

/** One test copy to the founder's own address. Not counted as sent to anyone. */
export async function sendTest(l: Letter, to: string): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 16)
  await resend('/emails', message({ ...l, to }, true), `move-test-${hash(`${to}.${l.subject}.${stamp}`)}`)
}

/**
 * Sends one email to everyone in `letters`, 100 at a time (Resend's batch
 * limit), and marks each batch as sent in the new app once Resend has it.
 * Returns how many went.
 */
export async function sendAll(email: MoveEmail, letters: Letter[]): Promise<number> {
  let sent = 0
  for (let i = 0; i < letters.length; i += 100) {
    const batch = letters.slice(i, i + 100)
    const ids = batch.map((l) => l.id).sort()
    await resend('/emails/batch', batch.map((l) => message(l)), `move-${email}-${hash(ids.join(','))}`)
    await standings(ids, email)
    sent += batch.length
  }
  return sent
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 32)
}
