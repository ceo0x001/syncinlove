/**
 * How long a push should outlive the moment that caused it.
 *
 * One uniform `TTL: 60 * 60 * 12, urgency: 'normal'` used to cover every kind, and it
 * is wrong in both directions at once.
 *
 * Too long for anything scoped to a day. `closing_soon` fires from 20:00 pair-local and
 * the question stays answerable until 06:00 — ten hours. At twelve, a phone that comes
 * back online at 08:00 gets "Still open. Thirty seconds keeps the streak" about a day
 * that shut two hours ago. Not a disaster, and not nothing either: a notification that
 * lies about a deadline teaches people to distrust the ones that don't.
 *
 * Far too short for everything else. A sealed letter reaching its date has no deadline
 * at all, and neither does something asked from a menu — the copy for that one literally
 * says "no clock on it". Twelve hours means a phone off for a weekend loses the letter
 * notification permanently. The vault is the most emotionally loaded thing in the
 * product and its notification was the most disposable.
 *
 * ── Why the database sends the number ────────────────────────────────────
 *
 * For day-scoped kinds the deadline is 06:00 in the PAIR's timezone, and the relay does
 * not know what that is — it receives an endpoint and a payload, deliberately, because
 * it holds no database credentials. Postgres knows the pair, the clock and the exact
 * deadline, so it computes the remaining seconds and sends them.
 *
 * This module is the other half: it decides what to do with a number that arrives from
 * outside, including when it does not arrive at all.
 */

/** Nudge kinds, as they appear in `nudges.kind` and travel as the notification tag. */
export type NudgeKind =
  | 'closing_soon'
  | 'partner_answered'
  | 'letter_ready'
  | 'letter_opened'
  | 'request'

export interface Delivery {
  /** Seconds the push service should keep trying. */
  ttl: number
  urgency: 'very-low' | 'low' | 'normal' | 'high'
}

/**
 * Below this, a TTL is not worth sending.
 *
 * A day-scoped nudge computed at 05:58 has 120 seconds left, and a push that expires
 * before it can plausibly be delivered is a wasted round trip rather than a fast one.
 * Anything shorter is rounded up to this — the notification is still nearly true, and
 * the alternative is dropping it silently.
 */
const MIN_TTL = 5 * 60

/** A week. Nothing in this product is worth chasing a dead device for longer. */
const MAX_TTL = 7 * 24 * 60 * 60

/**
 * What each kind gets when the database sends no number.
 *
 * Reachable for real: the relay and the migration deploy independently, so an older
 * `send_nudges` will keep posting bodies with no ttl for as long as it takes to run
 * 0026. These are the values that make that period sensible rather than merely
 * unchanged — a static fallback per kind is already better than one number for all of
 * them, so the relay improves things on its own.
 */
const FALLBACK: Record<NudgeKind, Delivery> = {
  /*
   * Ten hours: 20:00 to 06:00, the window in which the question can still be answered.
   * High urgency because it is the only kind with a deadline — a push service is
   * permitted to batch 'normal' ones, and a reminder that arrives after the thing it
   * reminds you about is worse than none.
   */
  closing_soon: { ttl: 10 * 60 * 60, urgency: 'high' },

  /*
   * Also day-scoped, but it can fire at any hour, so ten hours is a guess where
   * closing_soon's is a window. The database's computed value is the right answer here
   * and this is only the floor under it.
   *
   * Normal urgency: it is genuinely useful — neither of them sees anything until you
   * answer too — but nothing is lost if it lands twenty minutes late.
   */
  partner_answered: { ttl: 10 * 60 * 60, urgency: 'normal' },

  /* No deadline. A letter waits, and so can this. */
  letter_ready: { ttl: 3 * 24 * 60 * 60, urgency: 'normal' },
  letter_opened: { ttl: 3 * 24 * 60 * 60, urgency: 'low' },

  /* "No clock on it — whenever you like", says the email. Match it. */
  request: { ttl: 3 * 24 * 60 * 60, urgency: 'normal' },
}

/** Anything unrecognised. Deliberately the old behaviour, so a new kind is never worse. */
const UNKNOWN: Delivery = { ttl: 12 * 60 * 60, urgency: 'normal' }

function isKind(value: unknown): value is NudgeKind {
  return typeof value === 'string' && value in FALLBACK
}

/**
 * Decide the delivery options for one push.
 *
 * `kind` comes from the notification tag, which is the nudge kind by construction — the
 * tag exists so a second "they answered" replaces the first in the tray rather than
 * stacking, and per-kind is exactly the granularity that needs. A SQL assertion keeps
 * those two facts welded together so this is not relying on a coincidence.
 *
 * A requested ttl is clamped rather than rejected. The relay does not get to decide
 * whether Postgres's arithmetic was sensible, but it does get to refuse a number that
 * would waste a request or chase a dead device for a month.
 */
export function deliveryFor(kind: unknown, requestedTtl?: unknown, requestedUrgency?: unknown): Delivery {
  const base = isKind(kind) ? FALLBACK[kind] : UNKNOWN

  let ttl = base.ttl
  if (typeof requestedTtl === 'number' && Number.isFinite(requestedTtl)) {
    ttl = Math.min(MAX_TTL, Math.max(MIN_TTL, Math.floor(requestedTtl)))
  }

  const urgencies: Delivery['urgency'][] = ['very-low', 'low', 'normal', 'high']
  const urgency =
    typeof requestedUrgency === 'string' &&
    (urgencies as string[]).includes(requestedUrgency)
      ? (requestedUrgency as Delivery['urgency'])
      : base.urgency

  return { ttl, urgency }
}
