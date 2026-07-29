'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createInvite, hashToken } from '@/lib/invite/token'
import { questionForDay } from '@/lib/questions/bank'
import { validatePayload } from '@/lib/questions/validate'
import { isValidTimeZone } from '@/lib/sync/day'

/**
 * Every action re-checks who the caller is.
 *
 * Server Functions are dispatched as POSTs to the route that defines them, so a
 * proxy matcher change can silently stop covering a mutation. Nothing here
 * relies on proxy.ts having run.
 */

export interface ActionResult {
  error?: string
  ok?: boolean
}

const NAME_MAX = 40

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 1 || name.length > NAME_MAX) return null
  return name
}

/**
 * First contact, for both people.
 *
 * Creates an anonymous session, so somebody tapping an invite link is answering
 * within seconds and has never seen a password field. The account is real from
 * this moment; attaching an email later upgrades it in place rather than
 * creating a second one, which is why nothing here needs migrating afterwards.
 */
export async function startSession(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const firstName = cleanName(formData.get('firstName'))
  const adult = formData.get('adult') === 'on'
  const inviteToken = formData.get('inviteToken')
  const rawTz = formData.get('timeZone')

  if (!firstName) {
    return { error: 'A first name, or whatever you want to be called.' }
  }
  if (!adult) {
    return { error: 'Sync is for adults — please confirm you’re 18 or over.' }
  }

  const timeZone =
    typeof rawTz === 'string' && isValidTimeZone(rawTz) ? rawTz : 'UTC'

  const supabase = await createClient()

  // Reuse an existing session if there is one, so a refresh mid-signup doesn't
  // strand somebody with two accounts.
  let {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.user) {
      return { error: friendlyAuthError(error?.message) }
    }
    user = data.user
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      first_name: firstName,
      adult_attested_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (profileError) {
    return { error: 'Could not save that name. Try again?' }
  }

  if (typeof inviteToken === 'string' && inviteToken.length > 0) {
    const { error } = await supabase.rpc('claim_invite', {
      p_token_hash: hashToken(inviteToken),
    })
    if (error) return { error: error.message }
  } else {
    const invite = createInvite()
    const { error } = await supabase.rpc('create_pair', {
      p_time_zone: timeZone,
      p_token_hash: invite.tokenHash,
      p_nonce: invite.nonce,
      p_expires_at: invite.expiresAt.toISOString(),
    })
    if (error) return { error: error.message }
  }

  revalidatePath('/')
  redirect('/')
}

/**
 * Records both halves of a submission.
 *
 * Validation runs here and again inside the database function. This is the only
 * place the client writes to, the result is immutable, and in Phase 3 it will
 * pay out — so it is the one place not to trust the client.
 */
export async function submitAnswer(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const dayIndex = Number(formData.get('dayIndex'))
  if (!Number.isInteger(dayIndex) || dayIndex < 0) {
    return { error: 'Something went wrong reading today’s question.' }
  }

  const question = questionForDay(dayIndex)

  let self: unknown
  let guess: unknown
  try {
    self = JSON.parse(String(formData.get('self') ?? '{}'))
    guess = JSON.parse(String(formData.get('guess') ?? '{}'))
  } catch {
    return { error: 'Something went wrong reading your answers.' }
  }

  const selfCheck = validatePayload(question, self)
  if (!selfCheck.ok) return { error: selfCheck.error }

  const guessCheck = validatePayload(question, guess)
  if (!guessCheck.ok) return { error: guessCheck.error }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Reload and try again.' }

  const { data, error } = await supabase.rpc('submit_answer', {
    p_day_index: dayIndex,
    p_self: selfCheck.value,
    p_guess: guessCheck.value,
  })

  if (error) return { error: error.message }

  const state = (data as { state?: string } | null)?.state

  revalidatePath('/')
  redirect(state === 'revealed' ? `/reveal/${dayIndex}` : '/')
}

/**
 * Step one of the email claim: attach an address to the anonymous account.
 *
 * Supabase sends a confirmation containing both a link and a 6-digit code. The
 * code is the one that matters — a link opened from a mail app frequently lands
 * in a different browser than the one holding this session, which would break
 * the upgrade-in-place at exactly the wrong moment and leave the user with two
 * accounts. Typing the code keeps everything in one browser context.
 */
export async function sendClaimCode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: 'That doesn’t look like an email address.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Reload and try again.' }

  const { error } = await supabase.auth.updateUser({ email })
  if (error) return { error: friendlyAuthError(error.message) }

  return { ok: true }
}

/** Step two: verify the code, which converts the anonymous user in place. */
export async function verifyClaimCode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const code = String(formData.get('code') ?? '').replace(/\D/g, '')

  if (code.length !== 6) return { error: 'The code is six digits.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email_change',
  })

  if (error) return { error: friendlyAuthError(error.message) }

  revalidatePath('/')
  return { ok: true }
}

/** The 24-hour undo when an invite link reached the wrong person. */
export async function revokeClaim(): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_claim')
  if (error) return { error: error.message }

  revalidatePath('/')
  return { ok: true }
}

/**
 * Supabase auth errors are written for developers. These are the ones a user is
 * actually likely to hit, so they get sentences instead.
 */
function friendlyAuthError(message?: string): string {
  const raw = (message ?? '').toLowerCase()

  if (raw.includes('anonymous sign-ins are disabled')) {
    return 'Anonymous sign-ins are turned off in Supabase. Enable them under Authentication → Sign In / Providers.'
  }
  if (raw.includes('rate limit') || raw.includes('too many requests')) {
    return 'Too many emails for now. Supabase’s built-in mailer allows only a few per hour — wait a little, or connect your own SMTP.'
  }
  if (raw.includes('already been registered') || raw.includes('already exists')) {
    return 'That address is already on another Sync account. Use a different one, or sign in on the device that has it.'
  }
  if (raw.includes('token has expired') || raw.includes('invalid')) {
    return 'That code has expired or doesn’t match. Send a new one?'
  }
  return message || 'Something went wrong. Try again?'
}
