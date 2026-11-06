import 'server-only'
import type { AdminAccount } from '@/lib/session'
import { moveConfigured } from '@/lib/move'
import { MOVE_EMAILS, PLANNED, plan, reachable, type MoveEmail, type Plan, type Standing } from './compose'
import { emailsConfigured, standings } from './send'

export interface MoveEmailRow {
  email: MoveEmail
  planned: string
  count: number
  skipped: Plan['skipped']
  /** The first person's email, as they'd get it. */
  preview: { subject: string; html: string } | null
}

export interface MoveEmailsView {
  /** Null when sending can go ahead; otherwise why not. */
  blocked: string | null
  rows: MoveEmailRow[]
}

/** What the admin page shows: each email, who it would reach now, and a preview. */
export async function moveEmailsView(accounts: AdminAccount[]): Promise<MoveEmailsView> {
  let s: Record<string, Standing> = {}
  let blocked: string | null = null
  if (!moveConfigured()) blocked = 'Bring my account isn’t set up in this app’s Vercel settings yet.'
  else {
    try {
      s = await standings(reachable(accounts).map((p) => p.id))
    } catch {
      blocked = 'Couldn’t reach the new app to check who has moved. Reload in a minute.'
    }
  }
  if (!blocked && !emailsConfigured()) blocked = 'Add RESEND_API_KEY in this app’s Vercel settings to send.'
  return {
    blocked,
    rows: MOVE_EMAILS.map((email) => {
      const p = plan(email, accounts, s)
      const first = p.letters[0]
      return {
        email,
        planned: PLANNED[email],
        count: p.letters.length,
        skipped: p.skipped,
        preview: first ? { subject: first.subject, html: first.html } : null,
      }
    }),
  }
}
