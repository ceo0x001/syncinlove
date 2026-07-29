/**
 * Env access in one place so a missing value fails loudly at the boundary
 * rather than as an opaque Supabase error three layers in.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.local.example to .env.local and fill it in from ` +
        `Supabase → Project Settings → API, then restart the dev server.`,
    )
  }
  return value
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function supabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * Absolute origin, used to build invite links that survive being pasted into a
 * chat app.
 *
 * Falls back through Vercel's own host variables so preview deployments produce
 * links that actually resolve — otherwise every invite generated on a preview
 * would point at localhost. Only read server-side.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    vercelHost(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    vercelHost(process.env.VERCEL_URL) ||
    'http://localhost:3000'

  return raw.replace(/\/+$/, '')
}

/** Vercel exposes these as bare hostnames, with no scheme. */
function vercelHost(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.startsWith('http') ? value : `https://${value}`
}

/** True when the app has not been pointed at a Supabase project yet. */
export function isConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
