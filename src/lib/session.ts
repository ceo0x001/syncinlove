import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { questionForDay } from '@/lib/questions/bank'
import type { Question } from '@/lib/questions/types'
import { addDays, currentDayIndex, openDayIndexes, secondsUntilRollover, streakFrom } from '@/lib/sync/day'
import { inviteUrl, tokenFromNonce } from '@/lib/invite/token'
import { siteUrl } from '@/lib/supabase/env'

export interface Me {
  id: string
  /** Anonymous until the address is confirmed. Everything works either way. */
  isAnonymous: boolean
  email: string | null
  /**
   * An address attached but not yet confirmed.
   *
   * Present from signup onward, since the address is collected on the first form
   * now. Until the code is entered the account still cannot be recovered, so the
   * UI keeps saying so rather than asking once.
   */
  pendingEmail: string | null
  firstName: string | null
  /** What the Rich List would print. Their choice, not their partner's. */
  listDisplay: 'name' | 'initial' | 'alias'
  listAlias: string | null
  /**
   * Whether they agree to appear on the Rich List at all.
   *
   * Separate from listDisplay, which only decides how they'd be printed. Both
   * partners must say yes before the couple shows up, and either withdrawing
   * removes it — a public list of two first names is a public statement that
   * those two are a couple, so one person cannot make it for both.
   */
  listOptIn: boolean
  /** Which nudges they want. Each defaults on, and each is separately refusable. */
  notify: { reminders: boolean; partner: boolean; requests: boolean }
  /**
   * Granted in SQL only — there is no write path to the admins table through the
   * API, so this cannot be self-assigned. Admins see the admin panel instead of
   * the app.
   */
  isAdmin: boolean
  /**
   * Set by an admin. Writing is blocked by a trigger in the database; this is
   * only so the app can say so plainly instead of failing at the last step.
   */
  suspendedAt: string | null
  suspendedReason: string | null
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
  /**
   * Past its seven days and no longer claimable.
   *
   * Worth a field of its own rather than a date comparison at each call site:
   * an expired link that still looks live is how an inviter sends something that
   * silently cannot work.
   */
  expired: boolean
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
  /**
   * Payouts and streak bonuses only. What the Rich List ranks on.
   *
   * Deliberately excludes tender received for honouring requests — otherwise a
   * couple could pass the same amount back and forth forever and both appear as
   * billionaires. The list measures attention; the balance reflects generosity.
   */
  earned: number
  /** Tender received for honouring requests. A different thing from earned. */
  received: number
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
  /** Tender committed to requests that haven't settled yet. */
  held: number
  /**
   * True when a balance has outrun what there is to spend it on.
   *
   * Transfers mean the money supply only grows — roughly 60,000 a day per couple,
   * none of which ever leaves. Prices are self-set and repriceable, which is the
   * negotiation the economy is meant to settle through, but nobody reprices
   * unprompted. So this is a mirror rather than a rule: decay or expiry would read
   * as punishment for playing well.
   */
  pilingUp: boolean
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

/**
 * Columns that must exist for the app to know who you are.
 *
 * Kept apart from the rest for a reason that has now cost two outages. A
 * PostgREST select is all-or-nothing: name one column that does not exist and the
 * whole row comes back as an error, so `first_name` is lost along with it. A null
 * first_name is what the home page reads as "no account yet", and it answers with
 * the signup form — which is indistinguishable from a genuine new visitor.
 *
 * So deploying code that references a column before its migration has run does
 * not degrade a feature, it locks every existing user out of their own account
 * and shows them a signup form. That happened with list_display, and then again
 * with the notify_* columns.
 */
const PROFILE_CORE = 'first_name'

/** Everything else. Nice to have, and never allowed to take the core down. */
const PROFILE_EXTRAS =
  'list_display, list_alias, list_opt_in, notify_reminders, notify_partner, notify_requests, ' +
  'suspended_at, suspended_reason'

/** The signed-in user, or null. Never throws on an absent session. */
export async function getMe(): Promise<Me | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Its own call rather than part of the profile select: is_admin() reads a table
  // the app cannot see, and a failure here must never be readable as "is an
  // admin". Defaults to false on any error.
  const adminRes = await supabase.rpc('is_admin')

  const attempt = await supabase
    .from('profiles')
    .select(`${PROFILE_CORE}, ${PROFILE_EXTRAS}`)
    .eq('id', user.id)
    .maybeSingle()

  let profile = attempt.data
  const error = attempt.error

  if (error) {
    console.error('[getMe] could not read the profile:', {
      userId: user.id,
      code: error.code,
      message: error.message,
    })

    // 42703 is "column does not exist" — a migration that has not been applied
    // yet. Retry with the core alone so the person stays signed in and merely
    // loses whatever the missing column powered. Every field below already has a
    // safe default, so this degrades instead of collapsing.
    if (error.code === '42703') {
      const retry = await supabase
        .from('profiles')
        .select(PROFILE_CORE)
        .eq('id', user.id)
        .maybeSingle()

      if (!retry.error) {
        console.warn('[getMe] falling back to core columns — a migration is behind')
        profile = retry.data as typeof profile
      }
    }
  }

  return {
    id: user.id,
    isAnonymous: user.is_anonymous ?? false,
    email: user.email ?? null,
    pendingEmail: user.new_email ?? null,
    firstName: profile?.first_name ?? null,
    listDisplay: (profile?.list_display ?? 'initial') as Me['listDisplay'],
    listAlias: profile?.list_alias ?? null,
    // Defaults to false, and a failed read must also read as false — never
    // publish somebody because a query went wrong.
    listOptIn: profile?.list_opt_in === true,
    // Default ON when the read fails, matching the column defaults — the failure
    // mode should be a reminder somebody didn't want, not silence they didn't ask
    // for on the day their streak broke.
    notify: {
      reminders: profile?.notify_reminders !== false,
      partner: profile?.notify_partner !== false,
      requests: profile?.notify_requests !== false,
    },
    isAdmin: adminRes.data === true,
    suspendedAt: (profile?.suspended_at as string | undefined) ?? null,
    suspendedReason: (profile?.suspended_reason as string | undefined) ?? null,
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
      expired:
        !claimedAt && new Date(inviteRes.data.expires_at as string).getTime() <= Date.now(),
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

  const [
    balanceRes,
    earnedRes,
    receivedRes,
    heldRes,
    theirBalanceRes,
    theirEarnedRes,
    theirReceivedRes,
    itemsRes,
    purchasesRes,
    changesRes,
  ] =
    await Promise.all([
      supabase.rpc('tender_balance', { p_user_id: me.id }),
      supabase.rpc('tender_earned', { p_user_id: me.id }),
      supabase.rpc('tender_received', { p_user_id: me.id }),
      supabase.rpc('tender_held'),
      partnerId
        ? supabase.rpc('tender_balance', { p_user_id: partnerId })
        : Promise.resolve({ data: 0 }),
      partnerId
        ? supabase.rpc('tender_earned', { p_user_id: partnerId })
        : Promise.resolve({ data: 0 }),
      partnerId
        ? supabase.rpc('tender_received', { p_user_id: partnerId })
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
    received: Number(receivedRes.data ?? 0),
  }
  const theirs: Wallet = {
    balance: Number(theirBalanceRes.data ?? 0),
    earned: Number(theirEarnedRes.data ?? 0),
    received: Number(theirReceivedRes.data ?? 0),
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
    held: Number(heldRes.data ?? 0),
    // Ten times the dearest thing they could ask for. Past that, the balance has
    // stopped constraining anything and repricing is the honest fix.
    pilingUp:
      theirMenu.length > 0 &&
      mine.balance > 10 * Math.max(...theirMenu.map((i) => i.price)),
    // The whole reason the menu ask waits: asked at signup it's homework, asked
    // once there's tender sitting unspent it's an itch.
    shouldPromptMenu: activeOwn === 0 && mine.balance > 0,
  }
}

export interface HistoryEntry {
  dayIndex: number
  syncScore: number
  prompt: string
  category: string
  /** Pair-local date this day belonged to, already formatted. */
  date: string
  revealedAt: string
}

export interface History {
  entries: HistoryEntry[]
  /** Mean sync across everything, so the page can say whether it's improving. */
  average: number
  best: HistoryEntry | null
  /** Days both people completed. Same number the vault counts. */
  total: number
}

/**
 * Everything you have already been shown, newest first.
 *
 * Reads only `reveals`, which is the one table holding both people's answers —
 * and it holds them because the database assembled it at the moment both had
 * submitted. So there is no privacy question here: a reveal is by definition
 * something you have already seen.
 *
 * This existed as a JSON export and nothing else. The accumulated history is the
 * reason to still be here in month two, and downloading a file is not a way to
 * read it.
 */
export async function loadHistory(): Promise<History | null> {
  const me = await getMe()
  if (!me) return null

  const supabase = await createClient()

  const { data: pairRow } = await supabase
    .from('pairs')
    .select('id, time_zone, day_zero')
    .neq('status', 'ended')
    .limit(1)
    .maybeSingle()

  if (!pairRow) return null

  const { data } = await supabase
    .from('reveals')
    .select('day_index, sync_score, revealed_at')
    .eq('pair_id', pairRow.id)
    .order('day_index', { ascending: false })

  const rows = data ?? []

  const entries: HistoryEntry[] = rows.map((row) => {
    const question = questionForDay(row.day_index as number)
    return {
      dayIndex: row.day_index as number,
      syncScore: row.sync_score as number,
      prompt: question.prompt,
      category: question.category,
      date: addDays(pairRow.day_zero as string, row.day_index as number),
      revealedAt: row.revealed_at as string,
    }
  })

  const total = entries.length
  const average =
    total === 0
      ? 0
      : Math.round(entries.reduce((sum, e) => sum + e.syncScore, 0) / total)

  // Ties go to the earlier day: the first time you hit a number is the one worth
  // remembering.
  const best = entries.reduce<HistoryEntry | null>((top, e) => {
    if (!top) return e
    if (e.syncScore > top.syncScore) return e
    if (e.syncScore === top.syncScore && e.dayIndex < top.dayIndex) return e
    return top
  }, null)

  return { entries, average, best, total }
}

export type RichListWindow = 'week' | 'all'

export interface RichListRow {
  rank: number
  labelA: string
  labelB: string
  earned: number
  isMine: boolean
}

export interface RichListStanding {
  optedIn: boolean
  partnerOptedIn: boolean
  /** Null when the couple isn't on this window's board at all. */
  rank: number | null
  earned: number
}

export interface RichList {
  window: RichListWindow
  rows: RichListRow[]
  standing: RichListStanding | null
}

/**
 * The Rich List.
 *
 * Both halves come from SECURITY DEFINER functions rather than a table read,
 * because the ledger is deliberately readable only inside your own pair and that
 * is not being relaxed for a leaderboard. What comes back is aggregates and the
 * display labels people chose — no ids, no ledger rows, no names anybody didn't
 * agree to show.
 */
export async function loadRichList(
  window: RichListWindow = 'all',
): Promise<RichList> {
  const supabase = await createClient()

  const [listRes, meRes] = await Promise.all([
    supabase.rpc('rich_list', { p_window: window, p_limit: 25 }),
    supabase.rpc('rich_list_me', { p_window: window }),
  ])

  const rows: RichListRow[] = (listRes.data ?? []).map(
    (r: {
      rank: number
      label_a: string
      label_b: string
      earned: number
      is_mine: boolean
    }) => ({
      rank: Number(r.rank),
      labelA: r.label_a,
      labelB: r.label_b,
      earned: Number(r.earned),
      isMine: r.is_mine === true,
    }),
  )

  const raw = meRes.data as {
    opted_in?: boolean
    partner_opted_in?: boolean
    rank?: number | null
    earned?: number
  } | null

  return {
    window,
    rows,
    standing: raw
      ? {
          optedIn: raw.opted_in === true,
          partnerOptedIn: raw.partner_opted_in === true,
          rank: raw.rank ?? null,
          earned: Number(raw.earned ?? 0),
        }
      : null,
  }
}

/* ---------------------------------------------------------------------------
   Admin

   Every read below comes from a SECURITY DEFINER function that checks admin
   status inside the database. There is no service_role key in this app, so a
   compromise of the web layer yields the anon key and still cannot reach any of
   this — and none of these functions returns anything anybody wrote.
   --------------------------------------------------------------------------- */

export interface AdminOverview {
  users: number
  usersConfirmed: number
  usersAnonymous: number
  pairsActive: number
  pairsPending: number
  pairsEnded: number
  pairsComplete: number
  revealsTotal: number
  revealsToday: number
  reveals7d: number
  signups7d: number
  signups30d: number
  richListOptedIn: number
  lettersSealed: number
  lettersOpened: number
}

export interface AdminAccount {
  userId: string
  firstName: string | null
  email: string | null
  pendingEmail: string | null
  confirmed: boolean
  isAnonymous: boolean
  isAdmin: boolean
  suspendedAt: string | null
  suspendedReason: string | null
  createdAt: string
  pairId: string | null
  pairStatus: string | null
  /** Who they are actually with, not merely whether somebody is there. */
  partnerName: string | null
  partnerEmail: string | null
  completedDays: number
  lastActive: string | null
  optedIn: boolean
}

export interface AdminData {
  overview: AdminOverview
  retention: { milestone: number; pairs: number }[]
  accounts: AdminAccount[]
  economy: Record<string, number>
  nudges: Record<string, unknown>
}

/** Null when the caller is not an admin, so the page can simply redirect. */
export async function loadAdmin(search?: string): Promise<AdminData | null> {
  const supabase = await createClient()

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (isAdmin !== true) return null

  const [overviewRes, retentionRes, accountsRes, economyRes, nudgesRes] =
    await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.rpc('admin_retention'),
      supabase.rpc('admin_accounts', { p_search: search ?? null, p_limit: 200 }),
      supabase.rpc('admin_economy'),
      supabase.rpc('admin_nudges'),
    ])

  const o = (overviewRes.data ?? {}) as Record<string, number>

  return {
    overview: {
      users: Number(o.users ?? 0),
      usersConfirmed: Number(o.users_confirmed ?? 0),
      usersAnonymous: Number(o.users_anonymous ?? 0),
      pairsActive: Number(o.pairs_active ?? 0),
      pairsPending: Number(o.pairs_pending ?? 0),
      pairsEnded: Number(o.pairs_ended ?? 0),
      pairsComplete: Number(o.pairs_complete ?? 0),
      revealsTotal: Number(o.reveals_total ?? 0),
      revealsToday: Number(o.reveals_today ?? 0),
      reveals7d: Number(o.reveals_7d ?? 0),
      signups7d: Number(o.signups_7d ?? 0),
      signups30d: Number(o.signups_30d ?? 0),
      richListOptedIn: Number(o.rich_list_opted_in ?? 0),
      lettersSealed: Number(o.letters_sealed ?? 0),
      lettersOpened: Number(o.letters_opened ?? 0),
    },
    retention: (retentionRes.data ?? []).map(
      (r: { milestone: number; pairs: number }) => ({
        milestone: Number(r.milestone),
        pairs: Number(r.pairs),
      }),
    ),
    accounts: (accountsRes.data ?? []).map(
      (a: Record<string, unknown>): AdminAccount => ({
        userId: String(a.user_id),
        firstName: (a.first_name as string) ?? null,
        email: (a.email as string) ?? null,
        pendingEmail: (a.pending_email as string) ?? null,
        confirmed: a.confirmed === true,
        isAnonymous: a.is_anonymous === true,
        isAdmin: a.is_admin === true,
        suspendedAt: (a.suspended_at as string) ?? null,
        suspendedReason: (a.suspended_reason as string) ?? null,
        createdAt: String(a.created_at),
        pairId: (a.pair_id as string) ?? null,
        pairStatus: (a.pair_status as string) ?? null,
        partnerName: (a.partner_name as string) ?? null,
        partnerEmail: (a.partner_email as string) ?? null,
        completedDays: Number(a.completed_days ?? 0),
        lastActive: (a.last_active as string) ?? null,
        optedIn: a.opted_in === true,
      }),
    ),
    economy: (economyRes.data ?? {}) as Record<string, number>,
    nudges: (nudgesRes.data ?? {}) as Record<string, unknown>,
  }
}
