import 'server-only'
import { createHmac } from 'node:crypto'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * "Bring my account": each person carries what they can see across to the new
 * Sync in Love, one tap each.
 *
 * Nothing here can read more than the person could already read in this app:
 * it uses their own session, under the same row rules as every other page. The
 * new app only accepts what this server has signed with MOVE_SECRET, a string
 * the founder puts in both places, so nobody else can send it anything.
 *
 * A couple moves once both have tapped. Until then, every visit to the home
 * screen sends again, so what they do here in the meantime isn't lost.
 */

export type MoveState = 'not_started' | 'waiting' | 'held_back' | 'moved' | 'left_behind'
export interface MoveStatus {
  state: MoveState
  /** Their partner's first name, while there's a couple to move. */
  partner: string | null
}

const NEW_URL = process.env.NEW_SYNC_URL
const NEW_SUPABASE_URL = process.env.NEW_SYNC_SUPABASE_URL
const NEW_PUBLIC_KEY = process.env.NEW_SYNC_PUBLISHABLE_KEY
const SECRET = process.env.MOVE_SECRET

/** Off until all four are set in Vercel, so nobody sees a button that can't work. */
export function moveConfigured(): boolean {
  return Boolean(NEW_URL && NEW_SUPABASE_URL && NEW_PUBLIC_KEY && SECRET && SECRET.length >= 32)
}

/** Where the new app lives, for links. */
export function newSyncUrl(): string {
  return NEW_URL ?? 'https://syncin.love'
}

async function relay(fn: string, body: object): Promise<MoveStatus> {
  const payload = JSON.stringify(body)
  const sentAt = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', SECRET as string).update(`${sentAt}.${payload}`).digest('hex')
  const res = await fetch(`${NEW_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: NEW_PUBLIC_KEY as string,
      'Content-Type': 'application/json',
      'Content-Profile': 'relay',
    },
    body: JSON.stringify({ payload, sent_at: sentAt, signature }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`the new app answered ${res.status}`)
  const data = (await res.json()) as MoveStatus
  return { state: data.state, partner: data.partner ?? null }
}

/** Every row of a table this person can see that matches, a page at a time. */
async function all(supabase: SupabaseClient, table: string, match: Record<string, string>): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').match(match).range(from, from + 999)
    if (error) throw new Error(`couldn't read ${table}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

/**
 * Where this person stands, once per request (the layout and the page both
 * ask). Null when moving isn't set up, nobody is signed in, or the new app
 * can't be reached, so this app carries on as normal.
 */
export const myMove = cache(async (): Promise<MoveStatus | null> => {
  if (!moveConfigured()) return null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  try {
    return await relay('old_account_status', { sender: user.id })
  } catch {
    return null
  }
})

/** Sends everything this person can see, and says where they stand after. */
export async function sendMyAccount(): Promise<MoveStatus> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const { data: pairId } = await supabase.rpc('current_pair_id')
  const byPair = (table: string) => (pairId ? all(supabase, table, { pair_id: pairId }) : Promise.resolve([]))
  const [profiles, pairs, pairMembers, pairDays, reveals, streakFreezes, tenderEntries, menuItems, menuPriceChanges, purchases, letters, answers] =
    await Promise.all([
      all(supabase, 'profiles', {}),
      pairId ? all(supabase, 'pairs', { id: pairId }) : Promise.resolve([]),
      byPair('pair_members'),
      byPair('pair_days'),
      byPair('reveals'),
      byPair('streak_freezes'),
      byPair('tender_entries'),
      byPair('menu_items'),
      byPair('menu_price_changes'),
      byPair('purchases'),
      byPair('letters'),
      pairId ? all(supabase, 'answers', { pair_id: pairId, user_id: user.id }) : Promise.resolve([]),
    ])

  return relay('receive_old_account', {
    sender: user.id,
    users: [
      {
        id: user.id,
        email: user.email ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        is_anonymous: user.is_anonymous ?? false,
        created_at: user.created_at,
      },
    ],
    profiles,
    pairs,
    pair_members: pairMembers,
    pair_days: pairDays,
    reveals,
    streak_freezes: streakFreezes,
    tender_entries: tenderEntries,
    menu_items: menuItems,
    menu_price_changes: menuPriceChanges,
    purchases,
    letters,
    answers,
  })
}
