import { describe, expect, it } from 'vitest'
import { stillOpen } from './frozen'

/**
 * The frozen app takes writes only where someone still needs to act: signing
 * in, bringing an account across, and the founder sending the move emails.
 */
describe('stillOpen', () => {
  it('keeps signing in, Bring my account and the admin page open', () => {
    for (const path of ['/signin', '/auth/callback', '/move', '/admin', '/admin/move']) expect(stillOpen(path)).toBe(true)
  })

  it('freezes everything else, including look-alike paths', () => {
    for (const path of ['/', '/today', '/menu', '/settings', '/administrator', '/movement']) expect(stillOpen(path)).toBe(false)
  })
})
