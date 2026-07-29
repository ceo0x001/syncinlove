import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Where an emailed link lands.
 *
 * This exists because of a real failure: somebody clicked a sign-in link and was
 * dropped on the signup screen as though they had never had an account. Supabase
 * had verified them and redirected to the site — and the app had nowhere to
 * receive that, so the session was thrown away.
 *
 * Two shapes are accepted, and the difference matters:
 *
 *   token_hash + type   Works in ANY browser. Nothing is needed beyond the URL,
 *                       so a link opened in a different browser than the one that
 *                       asked for it still signs the person in. This is the shape
 *                       our email templates use.
 *
 *   code                PKCE. Requires the code_verifier cookie set by the browser
 *                       that started the flow, so it only works in that same
 *                       browser. Supported because Supabase's own default
 *                       templates produce it, and failing silently on it is how
 *                       people conclude their account is gone.
 *
 * The typed code on the sign-in screen remains the primary path. This is the
 * safety net for everyone who taps the link instead, which on a phone is most
 * people.
 */

const ALLOWED_TYPES: EmailOtpType[] = [
  'magiclink',
  'email',
  'signup',
  'invite',
  'recovery',
  'email_change',
]

export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const rawType = url.searchParams.get('type')
  const code = url.searchParams.get('code')

  // Only ever an in-app path, never a caller-supplied URL — an open redirect on
  // an auth callback hands attackers a way to bounce people off a trusted domain.
  const requested = url.searchParams.get('next')
  const next = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  const supabase = await createClient()

  if (tokenHash && rawType && ALLOWED_TYPES.includes(rawType as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    })
    if (!error) redirect(next)

    return fail(url, error.message)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) redirect(next)

    // The overwhelmingly likely cause: the link was opened in a different browser
    // from the one that requested it, so the verifier cookie isn't here. Say that,
    // rather than leaving somebody staring at a signup form.
    return fail(
      url,
      'That link was opened in a different browser than the one that asked for it. Put in your email again and type the code instead.',
    )
  }

  return fail(url, 'That link is missing something. Try signing in again.')
}

function fail(url: URL, message: string): Response {
  const target = new URL('/signin', url.origin)
  target.searchParams.set('problem', message)
  return Response.redirect(target.toString(), 303)
}
