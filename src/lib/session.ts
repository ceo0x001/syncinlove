import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { questionForDay } from '@/lib/questions/bank'
import type { Question } from '@/lib/questions/types'
import { currentDayIndex, openDayIndexes, secondsUntilRollover, streakFrom } from '@/lib/sync/day'
import { inviteUrl, tokenFromNonce } from '@/lib/invite/token'
import { siteUrl } from '@/lib/supabase/env'

export interface Me {
  id: string
  /** Anonymous until they attach an email. Everything still works either way. */
  isAnonymous: boolean
  email: string | null
  firstName: string | null
}

export interface Partner {
  id: string
  firstName: string
}

export interface PairInfo {
  id: string
  timeZone: string
  dayZero: string
  status: 'pending' | 'active' | 'ended'
}

export interface InviteInfo {
  url: string
  claimed: boolean
  claimedAt: string | null
  expiresAt: string
  /** Whether the inviter is still inside the 24-hour undo window. */
  canRevoke: boolean
}

export interface OpenDay {
  dayIndex: number
  question: Question
  /** Whether I have submitted for this day. */
  answered: boolean
  /** Whether my partner has. A boolean only — never their answer. */
  partnerAnswered: boolean
  /** Present once both have answered. */
  revealed: boolean
  /** True for the previous day still inside its grace window. */
  isGrace: boolean
}

export interface MenuItem {
  id: string
  title: string
  price: number
  active: boolean
  /** Set when the price moved, so the change is visible rather than silent. */
  lastPriceChange: { from: number; to: number; at: string } | null
}

export interface Purchase {
  id: string
  title: string
  price: number
  status: 'requested' | 'fulfilled' | 'declined'
  /** True when the caller is the one who paid. */
  iBought: boolean
  createdAt: string
}

export interface Wallet {
  /** Derived from the ledger; there is no stored total to drift. */
  balance: number
  /** Credits only. What the Rich List will rank on — never the net balance. */
  earned: number
}

export interface Economy {
  mine: Wallet
  /** Their balance too. Nothing in the economy is hidden inside a pair. */
  theirs: Wallet
  myMenu: MenuItem[]
  theirMenu: MenuItem[]
  purchases: Purchase[]
  /** Gates on spending, each with its own reason. */
  canSpend: boolean
  needsEmail: boolean
  needsMoreItems: number
  /** True once holding unspent tender makes the menu prompt land as an itch. */
  shouldPromptMenu: boolean
}

export interface HomeState {
  me: Me
  partner: Partner | null
  pair: PairInfo | null
  invite: InviteInfo | null
  /** Newest first. Usually one; two between midnight and 06:00 pair-local. */
  openDays: OpenDay[]
  /** Every day both partners completed, for the streak. */
  completedDays: number[]
  streak: number
  secondsToRollover: number
  /** Null before a pairing exists. */
  economy: Economy | null
}

/** The signed-in user, or null. Never throws on an absent session. */
export async function getMe(): Promise<Me | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    isAnonymous: user.is_anonymous ?? false,
    email: user.email ?? null,
    firstName: profile?.first_name ?? null,
  }
}

/**
 * Everything the home screen needs, in one place.
 *
 * Note what is absent: there is no query here for the partner's answer, because
 * RLS makes that unreadable and no amount of application code can change it.
 * "Has your partner answered" comes back as a boolean from a function, and the
 * content only ever arrives via a reveal the database wrote itself.
 */
export async function loadHome(): Promise<HomeState | null> {
  const me = await getMe()
  if (!me) return null

  const supabase = await createClient()

  const { data: pairRow } = await supabase
    .from('pairs')
    .select('id, time_zone, day_zero, status')
    .neq('status', 'ended')
    .limit(1)
    .maybeSingle()

  if (!pairRow) {
    return {
      me,
      partner: null,
      pair: null,
      invite: null,
      openDays: [],
      completedDays: [],
      streak: 0,
      secondsToRollover: 0,
      economy: null,
    }
  }

  const pair: PairInfo = {
    id: pairRow.id,
    timeZone: pairRow.time_zone,
    dayZero: pairRow.day_zero,
    status: pairRow.status,
  }

  const now = new Date()
  const openIndexes = openDayIndexes(now, pair.dayZero, pair.timeZone)

  const [membersRes, myAnswersRes, revealsRes, inviteRes] = await Promise.all([
    supabase.from('pair_members').select('user_id, role').eq('pair_id', pair.id).is('left_at', null),
    // RLS scopes this to my own rows, so it is exactly "days I have answered".
    supabase.from('answers').select('day_index').eq('pair_id', pair.id),
    supabase.from('reveals').select('day_index').eq('pair_id', pair.id),
    supabase
      .from('invites')
      .select('nonce, expires_at, claimed_at, revoked_at')
      .eq('pair_id', pair.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const partnerId = membersRes.data?.find((m) => m.user_id !== me.id)?.user_id ?? null

  let partner: Partner | null = null
  if (partnerId) {
    const { data } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('id', partnerId)
      .maybeSingle()
    if (data) partner = { id: partnerId, firstName: data.first_name }
  }

  const myAnsweredDays = new Set((myAnswersRes.data ?? []).map((r) => r.day_index as number))
  const revealedDays = new Set((revealsRes.data ?? []).map((r) => r.day_index as number))

  // One round trip per open day, and there are at most two.
  const partnerFlags = await Promise.all(
    openIndexes.map(async (dayIndex) => {
      if (!partnerId) return false
      if (revealedDays.has(dayIndex)) return true
      const { data } = await supabase.rpc('partner_answered', { p_day_index: dayIndex })
      return Boolean(data)
    }),
  )

  const today = currentDayIndex(now, pair.dayZero, pair.timeZone)

  const openDays: OpenDay[] = openIndexes.map((dayIndex, i) => ({
    dayIndex,
    question: questionForDay(dayIndex),
    answered: myAnsweredDays.has(dayIndex),
    partnerAnswered: partnerFlags[i],
    revealed: revealedDays.has(dayIndex),
    isGrace: dayIndex < today,
  }))

  let invite: InviteInfo | null = null
  if (inviteRes.data) {
    const claimedAt = inviteRes.data.claimed_at as string | null
    invite = {
      url: inviteUrl(siteUrl(), tokenFromNonce(inviteRes.data.nonce)),
      claimed: Boolean(claimedAt),
      claimedAt,
      expiresAt: inviteRes.data.expires_at,
      canRevoke:
        Boolean(claimedAt) && Date.now() - new Date(claimedAt as string).getTime() < 24 * 3_600_000,
    }
  }

  const completedDays = [...revealedDays].sort((a, b) => a - b)

  return {
    me,
    partner,
    pair,
    invite,
    openDays,
    completedDays,
    streak: streakFrom(completedDays),
    secondsToRollover: secondsUntilRollover(now, pair.timeZone),
    economy: await loadEconomy(pair.id, me, partnerId),
  }
}

/**
 * Wallets, menus and purchases.
 *
 * Balances come from `sum()` over the ledger rather than a stored total. That
 * costs a little on read and buys the thing the Rich List needs: tender *earned*
 * stays intact when somebody spends, which a net balance destroys.
 */
async function loadEconomy(
  pairId: string,
  me: Me,
  partnerId: string | null,
): Promise<Economy> {
  const supabase = await createClient()

  const [balanceRes, earnedRes, theirBalanceRes, theirEarnedRes, itemsRes, purchasesRes, changesRes] =
    await Promise.all([
      supabase.rpc('tender_balance', { p_user_id: me.id }),
      supabase.rpc('tender_earned', { p_user_id: me.id }),
      partnerId
        ? supabase.rpc('tender_balance', { p_user_id: partnerId })
        : Promise.resolve({ data: 0 }),
      partnerId
        ? supabase.rpc('tender_earned', { p_user_id: partnerId })
        : Promise.resolve({ data: 0 }),
      supabase
        .from('menu_items')
        .select('id, owner_id, title, price, active')
        .eq('pair_id', pairId)
        .order('price', { ascending: true }),
      supabase
        .from('purchases')
        .select('id, title, price, status, buyer_id, created_at')
        .eq('pair_id', pairId)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('menu_price_changes')
        .select('item_id, old_price, new_price, changed_at')
        .eq('pair_id', pairId)
        .order('changed_at', { ascending: false }),
    ])

  // Most recent change per item, so the UI can say "was T40" rather than nothing.
  const latestChange = new Map<string, { from: number; to: number; at: string }>()
  for (const row of changesRes.data ?? []) {
    if (!latestChange.has(row.item_id)) {
      latestChange.set(row.item_id, {
        from: row.old_price,
        to: row.new_price,
        at: row.changed_at,
      })
    }
  }

  const toItem = (row: {
    id: string
    title: string
    price: number
    active: boolean
  }): MenuItem => ({
    id: row.id,
    title: row.title,
    price: row.price,
    active: row.active,
    lastPriceChange: latestChange.get(row.id) ?? null,
  })

  const allItems = itemsRes.data ?? []
  const myMenu = allItems.filter((i) => i.owner_id === me.id).map(toItem)
  const theirMenu = allItems
    .filter((i) => i.owner_id !== me.id && i.active)
    .map(toItem)

  const mine: Wallet = {
    balance: Number(balanceRes.data ?? 0),
    earned: Number(earnedRes.data ?? 0),
  }
  const theirs: Wallet = {
    balance: Number(theirBalanceRes.data ?? 0),
    earned: Number(theirEarnedRes.data ?? 0),
  }

  const activeOwn = myMenu.filter((i) => i.active).length
  const needsMoreItems = Math.max(0, 3 - activeOwn)
  const needsEmail = me.isAnonymous

  return {
    mine,
    theirs,
    myMenu,
    theirMenu,
    purchases: (purchasesRes.data ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      status: p.status,
      iBought: p.buyer_id === me.id,
      createdAt: p.created_at,
    })),
    canSpend: !needsEmail && needsMoreItems === 0,
    needsEmail,
    needsMoreItems,
    // The whole reason the menu ask waits: asked at signup it's homework, asked
    // once there's tender sitting unspent it's an itch.
    shouldPromptMenu: activeOwn === 0 && mine.balance > 0,
  }
}
