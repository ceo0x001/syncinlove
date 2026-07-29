/**
 * Tender constants and formatting, for the UI.
 *
 * The database is the authority — these mirror the immutable SQL functions in
 * 0003_tender_scale.sql, and the SQL test asserts the two agree. They exist here
 * so a price input can show useful guidance without a round trip.
 *
 * On the magnitude: tender is a closed currency with no external peg, so only the
 * *ratio* of daily earnings to menu prices means anything. The scale is large
 * because a leaderboard reading "T1,240,000 earned" lands and "T1,800" doesn't.
 * Nothing about the economy changes with the denomination.
 */

export const TENDER_COMPLETION = 10_000
export const TENDER_ACCURACY_MAX = 30_000
export const TENDER_DAILY_CAP = 40_000

/**
 * A single menu item caps at ten perfect days.
 *
 * The rule is a ratio, not a number: an item nobody could ever afford is a way of
 * refusing without saying so, and ten days is far enough to price something
 * genuinely big while staying reachable.
 */
export const MENU_PRICE_CEILING = TENDER_DAILY_CAP * 10

export const STREAK_MILESTONES: readonly { days: number; bonus: number }[] = [
  { days: 7, bonus: 25_000 },
  { days: 14, bonus: 50_000 },
  { days: 30, bonus: 125_000 },
  { days: 60, bonus: 300_000 },
]

/** What a given sync score pays each partner. Mirrors tender_payout_for_score. */
export function payoutForScore(score: number): number {
  const clamped = Math.max(0, Math.min(100, score))
  return Math.min(
    TENDER_DAILY_CAP,
    TENDER_COMPLETION + Math.round((TENDER_ACCURACY_MAX * clamped) / 100),
  )
}

/**
 * Grouped digits, because five figures without separators is unreadable.
 * en-US rather than the viewer's locale so a price never renders as "40.000"
 * to one partner and "40,000" to the other.
 */
export function formatTender(amount: number): string {
  return amount.toLocaleString('en-US')
}

/** With the unit. The T goes in front, like a currency symbol. */
export function tender(amount: number): string {
  return `T${formatTender(amount)}`
}

/**
 * A price in the only unit that carries intuition here.
 *
 * This matters more at this scale than it did at the old one: "T25,000" means
 * nothing on its own, but "about half a day of syncing" is immediately legible.
 * It is doing the work the raw number can't.
 */
export function priceContext(price: number): string {
  if (price <= 0) return ''

  const days = price / TENDER_DAILY_CAP

  if (days < 0.25) return 'a few hours of syncing'
  if (days < 0.75) return 'about half a day of syncing'
  if (days < 1.5) return 'about a day of syncing'
  if (days < 9) return `about ${Math.round(days)} days of syncing`
  return 'the most you can price anything'
}

/** A rough, honest sense of how long a balance took to build. */
export function daysOfSyncing(amount: number): number {
  return Math.round((amount / TENDER_DAILY_CAP) * 10) / 10
}
