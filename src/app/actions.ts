'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createInvite, hashToken } from '@/lib/invite/token'
import { questionForDay } from '@/lib/questions/bank'
import { validatePayload } from '@/lib/questions/validate'
import { isValidTimeZone } from '@/lib/sync/day'
import { MENU_PRICE_CEILING, tender } from '@/lib/tender'

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
  /** Set when the right next step is signing in rather than signing up. */
  signIn?: boolean
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
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!firstName) {
    return { error: 'A first name, or whatever you want to be called.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: 'An email, so you can get back into this account.' }
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

  // Attach the address BEFORE writing a profile or a pairing, so an address that
  // already belongs to somebody leaves nothing behind — no half-made account, no
  // stray pairing. The profile-less anonymous user is swept by the Phase 5 job.
  const { error: emailError } = await supabase.auth.updateUser({ email })

  if (emailError) {
    const message = emailError.message.toLowerCase()

    // The case that actually bit somebody: typing an address that already has an
    // account on a new browser. This used to warn to the server console and carry
    // on, quietly creating a second empty account instead of reaching the first.
    if (message.includes('already') || message.includes('registered')) {
      return {
        error: 'That address already has an account. Sign in instead.',
        signIn: true,
      }
    }

    // Anything else — a rate-limited mailer, a transient failure — must not cost
    // somebody the account they are in the middle of making. They can confirm from
    // the banner on the home screen.
    console.warn('[startSession] could not send the claim code:', emailError.message)
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
 * Supabase sends a confirmation containing both a link and a numeric code. The
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

  // Supabase's OTP length is a project setting, configurable from 6 to 10 —
  // don't hard-code 6, or raising it silently locks everyone out of their own
  // account with a "wrong length" error while the code they were sent is valid.
  if (code.length < 6 || code.length > 10) {
    return { error: 'That code doesn’t look right — check you copied all of it.' }
  }

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

/* ---------------------------------------------------------------------------
   Phase 3 — tender
   --------------------------------------------------------------------------- */

/** Write or reprice one of your own menu items. Never your partner's. */
export async function saveMenuItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rawId = formData.get('itemId')
  const itemId = typeof rawId === 'string' && rawId.length > 0 ? rawId : null
  const title = String(formData.get('title') ?? '').trim().replace(/\s+/g, ' ')
  const price = Number(formData.get('price'))

  if (title.length < 2) return { error: 'Give it a name.' }
  if (title.length > 90) return { error: 'A little shorter?' }
  if (!Number.isInteger(price) || price < 1 || price > MENU_PRICE_CEILING) {
    return { error: `Price it between T1 and ${tender(MENU_PRICE_CEILING)}.` }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Reload and try again.' }

  const { error } = await supabase.rpc('upsert_menu_item', {
    p_item_id: itemId,
    p_title: title,
    p_price: price,
  })
  if (error) return { error: error.message }

  revalidatePath('/menu')
  revalidatePath('/')
  return { ok: true }
}

/** Unlist or relist. Available even mid-purchase — consent is withdrawable. */
export async function setMenuItemActive(
  itemId: string,
  active: boolean,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_menu_item_active', {
    p_item_id: itemId,
    p_active: active,
  })
  if (error) return { error: error.message }

  revalidatePath('/menu')
  revalidatePath('/')
  return { ok: true }
}

/** Ask for something from their menu. Debits immediately; refundable in full. */
export async function buyMenuItem(itemId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Reload and try again.' }

  const { error } = await supabase.rpc('buy_menu_item', { p_item_id: itemId })
  if (error) return { error: error.message }

  revalidatePath('/menu')
  revalidatePath('/')
  return { ok: true }
}

/** The buyer confirms it happened. Only ever the buyer. */
export async function markFulfilled(purchaseId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_purchase_fulfilled', {
    p_purchase_id: purchaseId,
  })
  if (error) return { error: error.message }

  revalidatePath('/menu')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Say no, and the tender goes straight back.
 *
 * No reason field, deliberately. Requiring one turns declining into a
 * justification, and the whole point is that "you already paid" must never
 * oblige anybody to do anything.
 */
export async function declinePurchase(purchaseId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_purchase', {
    p_purchase_id: purchaseId,
  })
  if (error) return { error: error.message }

  revalidatePath('/menu')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Pays the completion floor for days answered alone whose window has closed.
 *
 * Called on page load rather than by a scheduler: there is no cron in this app,
 * and a person opening it is the only signal needed. Idempotent, so calling it
 * on every render is harmless.
 */
export async function settleOpenDays(): Promise<void> {
  const supabase = await createClient()
  await supabase.rpc('settle_open_days')
}

/* ---------------------------------------------------------------------------
   Identity
   --------------------------------------------------------------------------- */

/**
 * Rename yourself, and choose what a leaderboard would print.
 *
 * Two separate decisions deliberately. The name is what the app calls you and
 * what your partner sees; the display choice is what a public list would show,
 * and putting two real first names on one discloses that two named people are a
 * couple. Each person controls their own; neither can publish the other.
 */
export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const firstName = cleanName(formData.get('firstName'))
  const rawDisplay = String(formData.get('listDisplay') ?? '')
  const alias = String(formData.get('listAlias') ?? '').trim()

  if (!firstName) return { error: 'A name, or whatever you want to be called.' }
  if (!['name', 'initial', 'alias'].includes(rawDisplay)) {
    return { error: 'Pick what shows on the list.' }
  }
  if (rawDisplay === 'alias' && alias.length < 1) {
    return { error: 'Type the alias you want shown.' }
  }
  if (alias.length > 24) return { error: 'That alias is a bit long.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_profile', {
    p_first_name: firstName,
    p_list_display: rawDisplay,
    p_list_alias: alias || null,
  })
  if (error) return { error: error.message }

  revalidatePath('/settings')
  revalidatePath('/')
  return { ok: true }
}

/* ---------------------------------------------------------------------------
   Phase 4 — the vault and the exits
   --------------------------------------------------------------------------- */

export async function sealLetter(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()
  const unlockOn = String(formData.get('unlockOn') ?? '')
  const dateVisible = formData.get('dateVisible') === 'on'

  if (title.length < 1) return { error: 'Give it a title — they’ll see that much.' }
  if (title.length > 80) return { error: 'A shorter title?' }
  if (body.length < 1) return { error: 'The letter is empty.' }
  if (body.length > 8000) return { error: 'That’s longer than the vault will hold.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(unlockOn)) return { error: 'Pick a date to open it.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('seal_letter', {
    p_title: title,
    p_body: body,
    p_unlock_on: unlockOn,
    p_date_visible: dateVisible,
  })
  if (error) return { error: error.message }

  revalidatePath('/vault')
  return { ok: true }
}

export async function openLetter(letterId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('open_letter', { p_letter_id: letterId })
  if (error) return { error: error.message }
  revalidatePath('/vault')
  return { ok: true }
}

/**
 * The recipient destroys a sealed letter without reading it.
 *
 * No confirmation dialog beyond the click, and no reason asked. Somebody
 * refusing a message from a person they may no longer want to hear from should
 * not have to explain themselves to the app.
 */
export async function destroyLetter(letterId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('destroy_letter', { p_letter_id: letterId })
  if (error) return { error: error.message }
  revalidatePath('/vault')
  return { ok: true }
}

/** The whole archive as JSON, for the person to keep. */
export async function exportArchive(): Promise<{ data?: string; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('export_archive')
  if (error) return { error: error.message }
  return { data: JSON.stringify(data, null, 2) }
}

/** End the pairing. `letters` is 'burn' or 'keep'; the UI defaults to burn. */
export async function endPairing(letters: 'burn' | 'keep'): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('end_pairing', { p_letters: letters })
  if (error) return { error: error.message }
  revalidatePath('/')
  revalidatePath('/settings')
  return { ok: true }
}

/** Destroy this account and everything they wrote. No undo. */
export async function burnEverything(confirm: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('burn_everything', { p_confirm: confirm })
  if (error) return { error: error.message }
  await supabase.auth.signOut()
  return { ok: true }
}


/* ---------------------------------------------------------------------------
   Signing in

   There was no login at all before this — only signup, which mints a fresh
   anonymous account and then attaches an address. On a new browser, typing an
   address that already had an account therefore could not reach it.
   --------------------------------------------------------------------------- */

/**
 * Email a sign-in code.
 *
 * `shouldCreateUser: false` matters twice over. It stops a typo silently creating
 * an empty account, and it keeps the semantics honest: this is a sign-in, not a
 * back door into signup.
 *
 * The reply is identical whether or not the address exists, so this cannot be
 * used to find out who has an account.
 */
export async function sendSignInCode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: 'That doesn’t look like an email address.' }
  }

  const supabase = await createClient()

  // Any session in this browser is abandoned deliberately. Signing in as somebody
  // else while still holding another session is how people end up looking at the
  // wrong account and thinking their data is gone.
  await supabase.auth.signOut()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })

  if (error) {
    const message = error.message.toLowerCase()
    // Deliberately swallowed: "no user found" would confirm which addresses have
    // accounts. Rate limits are worth surfacing, since they are actionable.
    if (message.includes('rate') || message.includes('too many')) {
      return { error: friendlyAuthError(error.message) }
    }
  }

  return { ok: true }
}

/** Verify the code and land in the account. */
export async function verifySignInCode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const code = String(formData.get('code') ?? '').replace(/\D/g, '')

  if (code.length < 6 || code.length > 10) {
    return { error: 'That code doesn’t look right — check you copied all of it.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    // 'email' here, not 'email_change' — this is a sign-in, not confirming a new
    // address on an existing account.
    type: 'email',
  })

  if (error) return { error: friendlyAuthError(error.message) }

  revalidatePath('/')
  redirect('/')
}
