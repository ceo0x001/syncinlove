import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * Server client for Server Components, Server Actions and Route Handlers.
 *
 * Next 16 made the request APIs async-only, so `cookies()` is awaited here and
 * this factory is therefore async too.
 *
 * Note this uses the anon key, never a service_role key. Every read is subject
 * to RLS, and the one operation that legitimately needs to see both partners'
 * answers at once (materializing a reveal) lives in a SECURITY DEFINER database
 * function instead. That way there is no code path in this app — buggy or
 * otherwise — that can read a partner's un-revealed answer.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components cannot set cookies. Session refresh is handled in
          // proxy.ts, which can, so swallowing this is correct rather than lossy.
        }
      },
    },
  })
}
