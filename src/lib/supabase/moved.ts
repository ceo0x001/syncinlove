import { createClient } from './server'
import { isConfigured } from './env'

/**
 * Where Sync in Love lives now, or null while this app is the live one. Set by
 * MOVED_TO in Vercel (which also makes proxy.ts refuse every write), or in the
 * database by supabase/migrations/0033_moved.sql, which also stops reminders.
 */
export async function movedTo(): Promise<string | null> {
  const fromVercel = process.env.MOVED_TO
  if (fromVercel?.startsWith('https://')) return fromVercel
  if (!isConfigured()) return null
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc('moved_to')
    return typeof data === 'string' && data.startsWith('https://') ? data : null
  } catch {
    return null
  }
}
