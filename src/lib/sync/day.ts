/**
 * The pair's calendar.
 *
 * A couple shares one timezone rather than each person having their own. Give
 * each partner a local day and two people eight hours apart drift onto
 * different question numbers, which destroys the only thing the product is:
 * the same question, at the same time, for both of you. Somebody in Los Angeles
 * paired with somebody in Lagos gets "today's question" at 4pm their time. That
 * is fine, and far less confusing than desynchronised days.
 *
 * A question opens at 00:00 pair-local and stays answerable for 30 hours — six
 * hours past the next rollover. That grace window is what stops the midnight
 * cliff, where one partner answers at 23:55, the other is asleep, and the day
 * turns over on an orphaned answer.
 */

export const WINDOW_HOURS = 30
/** Hours past rollover that the previous day's question stays answerable. */
export const GRACE_HOURS = WINDOW_HOURS - 24

export interface LocalParts {
  /** Pair-local calendar date, YYYY-MM-DD. */
  date: string
  hour: number
  minute: number
  second: number
}

/**
 * Wall-clock parts in the pair's timezone.
 *
 * Uses Intl rather than date arithmetic so DST is handled by the platform's
 * tz database instead of by assumptions of mine.
 */
export function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00'

  // Some platforms render midnight as hour 24 under hour12:false.
  const hour = Number(get('hour')) % 24

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
  }
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Days between two YYYY-MM-DD dates. Both are plain dates, so UTC is safe. */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`)
  const to = Date.parse(`${toISO}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new Error(`Invalid date in daysBetween(${fromISO}, ${toISO})`)
  }
  return Math.round((to - from) / 86_400_000)
}

/** Add days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addDays(dateISO: string, days: number): string {
  const ms = Date.parse(`${dateISO}T00:00:00Z`) + days * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Which day of the pair's life it is right now. Day 0 is the day they paired.
 */
export function currentDayIndex(now: Date, dayZeroISO: string, timeZone: string): number {
  return daysBetween(dayZeroISO, localParts(now, timeZone).date)
}

/**
 * Every day index a person may still answer right now, newest first.
 *
 * Between midnight and 06:00 pair-local there are two: today's fresh question
 * and yesterday's, still inside its grace window. At every other hour, one.
 */
export function openDayIndexes(now: Date, dayZeroISO: string, timeZone: string): number[] {
  const { date, hour } = localParts(now, timeZone)
  const today = daysBetween(dayZeroISO, date)

  const open = [today]
  if (hour < GRACE_HOURS && today - 1 >= 0) {
    open.push(today - 1)
  }
  return open.filter((d) => d >= 0)
}

/** Whether a given day's question still accepts answers. */
export function isDayOpen(
  dayIndex: number,
  now: Date,
  dayZeroISO: string,
  timeZone: string,
): boolean {
  return openDayIndexes(now, dayZeroISO, timeZone).includes(dayIndex)
}

/**
 * Seconds until the pair's next midnight — the "resets in 6h 12m" countdown.
 *
 * Derived from the pair-local wall clock, which means on the one or two days a
 * year the pair's zone shifts, this can be an hour out. That is a cosmetic
 * drift in a countdown; window enforcement above compares dates and hours
 * directly and stays exact through the transition.
 */
export function secondsUntilRollover(now: Date, timeZone: string): number {
  const { hour, minute, second } = localParts(now, timeZone)
  return 86_400 - (hour * 3600 + minute * 60 + second)
}

/** "6h 12m" / "48m" / "40s" — deliberately not a ticking clock to the second. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${s}s`
}

/**
 * Streak: consecutive completed questions, counting back from the most recent.
 *
 * The unit is a completed question, not a calendar day. Tying it to the
 * calendar makes the streak hostage to clock timing rather than to effort — the
 * 30-hour window would be pointless if answering at 01:00 still broke the run.
 *
 * `completedDayIndexes` is every day this pair both answered, in any order.
 */
export function streakFrom(
  completedDayIndexes: number[],
  frozenDayIndexes: number[] = [],
): number {
  if (completedDayIndexes.length === 0) return 0

  const done = new Set(completedDayIndexes)
  const frozen = new Set(frozenDayIndexes)
  const top = Math.max(...done)

  /**
   * Walk down from the newest answered day and stop at the first day that is
   * neither answered nor forgiven.
   *
   * Rewritten from a scan over the sorted answered days, which could not express a
   * forgiven gap — it broke at the first non-consecutive pair and had no way to
   * know the hole was covered.
   *
   * A frozen day advances the walk and does NOT increment the count. That is the
   * rule the whole feature rests on: a freeze forgives a gap, it never substitutes
   * for an answer, so the milestone at 60 still needs 60 real days. It must match
   * pair_streak in 0019 exactly — the SQL pays the tender and this draws the
   * number, and the two disagreeing is a support ticket nobody can diagnose.
   */
  let streak = 0
  for (let day = top; day >= 0; day -= 1) {
    if (done.has(day)) streak += 1
    else if (!frozen.has(day)) break
  }
  return streak
}
