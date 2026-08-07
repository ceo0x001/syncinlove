import { describe, expect, it } from 'vitest'
import { deliveryFor } from './delivery'

/**
 * One uniform twelve-hour TTL used to cover all five kinds, and it was wrong in both
 * directions: two hours too long for a question that stops being answerable at 06:00,
 * and days too short for a sealed letter that has no deadline at all.
 *
 * These are cheap because the logic is pure. The half that is not pure — the exact
 * seconds until 06:00 in a pairing's own timezone — lives in SQL and is asserted in
 * phase7_push.sql, because that is where the pair's clock is known.
 */
describe('deliveryFor', () => {
  it('gives a deadline-bearing nudge high urgency', () => {
    // The only kind with a deadline. A push service may batch 'normal' deliveries, and
    // a reminder arriving after the thing it reminds you about is worse than none.
    expect(deliveryFor('closing_soon').urgency).toBe('high')
  })

  it('lets a letter outlive a weekend', () => {
    // Twelve hours meant a phone off from Friday lost this permanently.
    const { ttl } = deliveryFor('letter_ready')
    expect(ttl).toBeGreaterThan(2 * 24 * 60 * 60)
  })

  it('does not make an unactionable notification compete for attention', () => {
    // Nothing to do about a letter having been read.
    expect(deliveryFor('letter_opened').urgency).toBe('low')
  })

  it('matches the copy for a menu request, which promises no clock', () => {
    expect(deliveryFor('request').ttl).toBeGreaterThan(2 * 24 * 60 * 60)
  })

  it('prefers the database’s number over its own default', () => {
    // Postgres knows the pair's timezone; this module does not. When a real deadline
    // arrives it wins.
    expect(deliveryFor('closing_soon', 3600).ttl).toBe(3600)
  })

  it('will not send a push that expires before it can arrive', () => {
    // A nudge computed at 05:58 has 120 seconds left. Floored rather than dropped.
    expect(deliveryFor('closing_soon', 30).ttl).toBe(300)
    expect(deliveryFor('closing_soon', 0).ttl).toBe(300)
    expect(deliveryFor('closing_soon', -500).ttl).toBe(300)
  })

  it('will not chase a dead device for a month', () => {
    expect(deliveryFor('request', 999_999_999).ttl).toBe(7 * 24 * 60 * 60)
  })

  /*
    Everything below arrives over HTTP from a caller this process does not trust. The
    relay validates rather than forwarding, because web-push would happily pass a
    garbage urgency straight to the push service and get an opaque 400 back.
  */
  it('ignores a ttl that is not a usable number', () => {
    const base = deliveryFor('letter_ready').ttl
    expect(deliveryFor('letter_ready', 'soon').ttl).toBe(base)
    expect(deliveryFor('letter_ready', NaN).ttl).toBe(base)
    expect(deliveryFor('letter_ready', null).ttl).toBe(base)
    expect(deliveryFor('letter_ready', Infinity).ttl).toBe(base)
  })

  it('ignores an urgency it does not recognise', () => {
    expect(deliveryFor('closing_soon', undefined, 'immediately').urgency).toBe('high')
    expect(deliveryFor('closing_soon', undefined, 42).urgency).toBe('high')
  })

  it('accepts the urgencies the web push protocol defines', () => {
    for (const u of ['very-low', 'low', 'normal', 'high'] as const) {
      expect(deliveryFor('request', undefined, u).urgency).toBe(u)
    }
  })

  /*
    An unrecognised kind keeps the old twelve-hour behaviour on purpose: adding a sixth
    nudge kind should never make delivery WORSE than it was before this file existed,
    and a new kind that forgets to appear here is a missing improvement rather than a
    regression.
  */
  it('falls back to the old behaviour for a kind it has never heard of', () => {
    expect(deliveryFor('brand_new_kind')).toEqual({ ttl: 12 * 60 * 60, urgency: 'normal' })
    expect(deliveryFor(undefined)).toEqual({ ttl: 12 * 60 * 60, urgency: 'normal' })
  })
})
