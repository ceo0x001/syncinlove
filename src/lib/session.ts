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
  }
}
