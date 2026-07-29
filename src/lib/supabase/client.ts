'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * Browser client. Only used for the two things that must happen client-side:
 * establishing the anonymous session on first paint, and the email-claim OTP
 * exchange. All reads and writes of couple data go through Server Actions.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey())
}
