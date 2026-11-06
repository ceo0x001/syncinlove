import type { AdminAccount } from '@/lib/session'
import { SUPPORT_URL } from '@/lib/support'

/**
 * The move emails: one announcement, then a reminder a week before the last
 * day and another the day before (the founder's plan of 6 November 2026).
 *
 * Pure functions, so what each person gets can be tested without sending
 * anything. Who has moved and who already had which email comes from the new
 * app (see send.ts); the addresses come from this app's admin list.
 */

export type MoveEmail = 'announce' | 'week' | 'last'
export const MOVE_EMAILS: MoveEmail[] = ['announce', 'week', 'last']

export type MoveState = 'not_started' | 'waiting' | 'held_back' | 'moved' | 'left_behind'
/** What the new app says about one old account. */
export interface Standing {
  state: MoveState
  partner: string | null
  sent: MoveEmail[]
}

export const PLANNED: Record<MoveEmail, string> = {
  announce: 'Monday 9 November',
  week: 'Sunday 22 November',
  last: 'Saturday 28 November',
}
export const LAST_DAY = 'Sunday 29 November'
export const LATE_UNTIL = 'Monday 7 December'
/** This app's own page. After moving day the new app sends /move back here. */
export const MOVE_LINK = 'https://syncin.love/move'

export interface Person {
  id: string
  firstName: string | null
  email: string
  partnerId: string | null
  partnerName: string | null
}

export interface Letter {
  id: string
  to: string
  subject: string
  html: string
  text: string
}

export interface Plan {
  email: MoveEmail
  letters: Letter[]
  skipped: { moved: number; alreadySent: number; heldBack: number; unreachable: number }
}

/** Everyone an email can reach: a confirmed address, not a guest, not suspended. */
export function reachable(accounts: AdminAccount[]): Person[] {
  return accounts
    .filter((a) => a.confirmed && !a.isAnonymous && !a.suspendedAt && a.email)
    .map((a) => {
      const partner =
        a.pairId && a.pairStatus === 'active'
          ? accounts.find((b) => b.pairId === a.pairId && b.userId !== a.userId)
          : undefined
      return {
        id: a.userId,
        firstName: a.firstName,
        email: a.email as string,
        partnerId: partner?.userId ?? null,
        partnerName: partner?.firstName ?? (a.pairStatus === 'active' ? a.partnerName : null),
      }
    })
}

/** Who gets this email, and what each of them reads. */
export function plan(email: MoveEmail, accounts: AdminAccount[], standings: Record<string, Standing>): Plan {
  const people = reachable(accounts)
  const skipped = { moved: 0, alreadySent: 0, heldBack: 0, unreachable: accounts.length - people.length }
  const letters: Letter[] = []
  for (const p of people) {
    const s = standings[p.id] ?? { state: 'not_started', partner: null, sent: [] }
    if (s.state === 'moved') skipped.moved += 1
    else if (s.state === 'held_back' || s.state === 'left_behind') skipped.heldBack += 1
    else if (s.sent.includes(email)) skipped.alreadySent += 1
    else letters.push(compose(email, p, s, p.partnerId ? standings[p.partnerId] : undefined))
  }
  return { email, letters, skipped }
}

const SUBJECT: Record<MoveEmail, string> = {
  announce: 'Sync in Love has a new home. Bring your account by 29 November',
  week: 'One week left to bring your Sync in Love account',
  last: 'Last day tomorrow: bring your Sync in Love account',
}

/** One person's email. Names are theirs to write, so they're escaped. */
export function compose(email: MoveEmail, p: Person, mine: Standing, theirs?: Standing): Letter {
  const name = p.firstName?.trim() || null
  const partner = (p.partnerName ?? mine.partner)?.trim() || null
  const waiting = mine.state === 'waiting'

  const opening =
    email === 'announce'
      ? partner
        ? 'We’ve rebuilt Sync in Love. It’s still one question a day, and it’s still the two of you, with more to do together.'
        : 'We’ve rebuilt Sync in Love. It’s still one question a day, with more to do together.'
      : email === 'week'
        ? `One week left: bring your account to the new Sync in Love by ${LAST_DAY}.`
        : `Tomorrow, ${LAST_DAY}, is the last day to bring your account to the new Sync in Love.`

  // Where this person (and their partner) stands decides the rest.
  const partnerLine = !partner
    ? null
    : waiting
      ? `You’ve already tapped Bring my account. ${partner} hasn’t yet, and your shared days move once they do.`
      : theirs?.state === 'waiting'
        ? `${partner} has already tapped. Your shared days move as soon as you tap too.`
        : `Ask ${partner} to tap too. Your shared days move once you both have.`
  const steps = waiting
    ? []
    : ['Open syncin.love and sign in.', 'Tap Bring my account.', ...(partnerLine ? [partnerLine] : [])]

  const deadline = `Please move by ${LAST_DAY}. After that, syncin.love opens the new Sync in Love, and you’ll have one more week to bring your account, until ${LATE_UNTIL}.`
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const button = waiting ? 'See where your move stands' : 'Bring my account'

  const text = [
    greeting,
    '',
    opening,
    '',
    ...(waiting
      ? [partnerLine ?? 'You’ve already tapped Bring my account.']
      : ['Your answers, streaks, Menu and Tender can all come with you. It takes one tap:', '', ...steps.map((s, i) => `${i + 1}. ${s}`)]),
    '',
    `${button}: ${MOVE_LINK}`,
    '',
    deadline,
    '',
    `Questions? Message us on WhatsApp: ${SUPPORT_URL}`,
    '',
    'The Sync in Love team',
    '',
    'You’re getting this because you have a Sync in Love account.',
  ].join('\n')

  const para = (s: string) => `<p style="margin:0 0 16px">${s}</p>`
  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:520px">',
    para(escape(greeting)),
    para(escape(opening)),
    waiting
      ? para(escape(partnerLine ?? 'You’ve already tapped Bring my account.'))
      : para('Your answers, streaks, Menu and Tender can all come with you. It takes one tap:') +
        `<ol style="margin:0 0 16px;padding-left:22px">${steps.map((s) => `<li style="margin:0 0 6px">${bold(escape(s))}</li>`).join('')}</ol>`,
    `<p style="margin:0 0 20px"><a href="${MOVE_LINK}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${button}</a></p>`,
    para(`<strong>${escape(deadline.split('. ')[0])}.</strong> ${escape(deadline.split('. ').slice(1).join('. '))}`),
    para(`Questions? <a href="${SUPPORT_URL}" style="color:#be123c">Message us on WhatsApp</a>.`),
    para('The Sync in Love team'),
    '<p style="margin:24px 0 0;color:#64748b;font-size:12px">You’re getting this because you have a Sync in Love account.</p>',
    '</div>',
  ].join('')

  return { id: p.id, to: p.email, subject: SUBJECT[email], html, text }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** The two things to tap or open stand out in the steps. */
function bold(s: string): string {
  return s.replace('syncin.love', '<strong>syncin.love</strong>').replace('Bring my account', '<strong>Bring my account</strong>')
}
