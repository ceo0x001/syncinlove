import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env'

/**
 * Next 16 renamed the `middleware` convention to `proxy`. Its only job here is
 * to refresh the Supabase session cookie so a long-lived anonymous session
 * doesn't quietly expire mid-flow and orphan somebody's answers.
 *
 * Deliberately does NOT gate access. Server Functions are dispatched as POSTs to
 * the route that defines them, so a matcher change can silently remove proxy
 * coverage from a mutation. Every action re-checks auth itself instead.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Before the project is pointed at Supabase, skip cleanly instead of throwing
  // on every request and burying the setup screen under a stack trace.
  if (!isConfigured()) return response

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Touching the user is what triggers the refresh-and-rotate.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
}
