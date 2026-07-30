import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/**
 * The push relay.
 *
 * A deliberately stupid endpoint. Postgres decides who gets notified and what it
 * says; this signs the result and forwards it. That split is the point.
 *
 * The alternative — a route with a service_role key that queries the queue itself
 * — would have been fewer moving parts and would have handed this process the
 * ability to read every un-revealed answer in the database. "Nothing can read
 * your partner's answer before you have answered" is the product. It is not worth
 * trading for a shorter file.
 *
 * So what runs here cannot ask the database anything. It receives one
 * subscription and one payload, encrypts, POSTs to the browser vendor, and its
 * only write-back is marking a dead endpoint dead. Compromised completely, it
 * could send notifications to people who already opted in to notifications.
 *
 * Node runtime, not edge: web-push needs node:crypto for the ECDSA signature.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** What Postgres sends. Validated rather than trusted — see below. */
interface RelayRequest {
  subscription?: {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }
  payload?: { title?: string; body?: string; url?: string; tag?: string }
}

function configured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.PUSH_RELAY_SECRET,
  )
}

export async function POST(request: Request) {
  if (!configured()) {
    // 503, not 500. This is "not set up yet", which is a different thing from
    // "broken", and the distinction matters when reading pg_net's response log.
    return Response.json({ error: 'Push is not configured.' }, { status: 503 })
  }

  // The shared secret. Compared with a length-safe comparison because this is a
  // public URL and the timing of a byte-by-byte === on a secret is measurable.
  const presented = request.headers.get('x-sync-relay-secret') ?? ''
  const expected = process.env.PUSH_RELAY_SECRET!
  if (!timingSafeEqual(presented, expected)) {
    return Response.json({ error: 'Not permitted.' }, { status: 401 })
  }

  let body: RelayRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Bad JSON.' }, { status: 400 })
  }

  const endpoint = body.subscription?.endpoint
  const p256dh = body.subscription?.keys?.p256dh
  const auth = body.subscription?.keys?.auth

  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: 'Incomplete subscription.' }, { status: 400 })
  }

  /**
   * Where this is allowed to POST.
   *
   * The secret already gates the caller, so this is defence in depth: it means
   * that even if somebody got the secret, this endpoint is not a general-purpose
   * outbound request forwarder sitting inside our infrastructure. Push endpoints
   * only ever belong to browser vendors.
   */
  let host: string
  try {
    const parsed = new URL(endpoint)
    if (parsed.protocol !== 'https:') throw new Error('not https')
    host = parsed.hostname
  } catch {
    return Response.json({ error: 'Not a push endpoint.' }, { status: 400 })
  }

  const allowed = [
    'android.googleapis.com',
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'push.services.mozilla.com',
    'web.push.apple.com',
    'wns2-*.notify.windows.com',
  ]
  const hostAllowed = allowed.some((pattern) =>
    pattern.includes('*')
      ? new RegExp(`^${pattern.replace(/[.]/g, '\\.').replace(/\*/g, '[^.]+')}$`).test(host)
      : host === pattern,
  )
  if (!hostAllowed) {
    return Response.json({ error: 'Unrecognised push host.' }, { status: 400 })
  }

  webpush.setVapidDetails(
    'mailto:me@emmanuelemenike.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  /**
   * Truncated on the way out.
   *
   * Postgres already refuses to put anybody's content in a payload, so this
   * cannot leak an answer. It exists because a notification body is rendered by
   * the OS with no length limit of its own, and a bug upstream should produce a
   * clipped notification rather than a wall of text on somebody's lock screen.
   */
  const payload = JSON.stringify({
    title: String(body.payload?.title ?? 'Sync').slice(0, 80),
    body: String(body.payload?.body ?? 'Something is waiting for you.').slice(0, 160),
    url: safeUrl(body.payload?.url),
    tag: String(body.payload?.tag ?? 'sync').slice(0, 40),
  })

  try {
    await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload, {
      TTL: 60 * 60 * 12,
      urgency: 'normal',
    })
    return Response.json({ ok: true })
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 0

    /**
     * 404 and 410 mean the browser threw the subscription away — app deleted,
     * permission revoked, profile wiped. The row must be retired or every send
     * from now on retries a dead endpoint forever.
     *
     * This is the one thing the relay writes back, and it goes through a function
     * that takes the shared secret rather than through a table grant, using the
     * anon key. There is still no service_role key in this process.
     */
    if (status === 404 || status === 410) {
      await retire(endpoint, status)
      return Response.json({ ok: false, retired: true }, { status: 200 })
    }

    console.error('push send failed', status, (error as Error).message)
    return Response.json({ error: 'Send failed.', status }, { status: 502 })
  }
}

/**
 * Only ever our own origin.
 *
 * The url ends up in `clients.openWindow()` inside the service worker. An
 * attacker who could set it arbitrarily could turn one of our own notifications
 * into a link to their page, which is a phishing primitive with our name on it.
 */
function safeUrl(raw: string | undefined): string {
  if (!raw) return 'https://syncin.love'
  try {
    const parsed = new URL(raw)
    if (parsed.hostname !== 'syncin.love') return 'https://syncin.love'
    return parsed.href
  } catch {
    return 'https://syncin.love'
  }
}

/** Length-independent comparison. Returns false on any length mismatch first. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function retire(endpoint: string, code: number): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return

  try {
    // A bare client with no session. retire_push_endpoint authorises on the
    // shared secret, which is the only credential this process has.
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await supabase.rpc('retire_push_endpoint', {
      p_secret: process.env.PUSH_RELAY_SECRET!,
      p_endpoint: endpoint,
      p_code: code,
    })
  } catch (error) {
    // A dead endpoint that stays marked alive costs one wasted POST per nudge.
    // Not worth failing the response over.
    console.error('could not retire endpoint', (error as Error).message)
  }
}
