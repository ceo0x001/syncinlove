import { describe, expect, it } from 'vitest'
import type { AdminAccount } from '@/lib/session'
import { compose, plan, reachable, type Standing } from './compose'

function account(id: string, extra: Partial<AdminAccount> = {}): AdminAccount {
  return {
    userId: id,
    firstName: id[0].toUpperCase() + id.slice(1),
    email: `${id}@old.test`,
    pendingEmail: null,
    confirmed: true,
    isAnonymous: false,
    isAdmin: false,
    suspendedAt: null,
    suspendedReason: null,
    createdAt: '2026-01-01T00:00:00Z',
    pairId: null,
    pairStatus: null,
    partnerName: null,
    partnerEmail: null,
    completedDays: 0,
    lastActive: null,
    optedIn: false,
    ...extra,
  }
}

const couple = (a: string, b: string, pair: string) => [
  account(a, { pairId: pair, pairStatus: 'active', partnerName: b[0].toUpperCase() + b.slice(1) }),
  account(b, { pairId: pair, pairStatus: 'active', partnerName: a[0].toUpperCase() + a.slice(1) }),
]
const fresh: Standing = { state: 'not_started', partner: null, sent: [] }

describe('who the move emails can reach', () => {
  it('skips guests, unconfirmed addresses and suspended accounts', () => {
    const people = reachable([
      account('ada'),
      account('guest', { isAnonymous: true, email: null, confirmed: false }),
      account('pending', { confirmed: false }),
      account('gone', { suspendedAt: '2026-10-01T00:00:00Z' }),
    ])
    expect(people.map((p) => p.id)).toEqual(['ada'])
  })

  it('finds each partner in the same couple', () => {
    const [ada] = reachable(couple('ada', 'ben', 'p1'))
    expect(ada).toMatchObject({ partnerId: 'ben', partnerName: 'Ben' })
  })
})

describe('who gets which email', () => {
  const accounts = [...couple('ada', 'ben', 'p1'), account('cy'), account('di'), account('ed'), account('guest', { isAnonymous: true, confirmed: false, email: null })]
  const standings: Record<string, Standing> = {
    ada: fresh,
    ben: fresh,
    cy: { state: 'moved', partner: null, sent: [] },
    di: { state: 'not_started', partner: null, sent: ['announce'] },
    ed: { state: 'held_back', partner: null, sent: [] },
  }

  it('leaves out anyone who moved, is held back, or already had it', () => {
    const p = plan('announce', accounts, standings)
    expect(p.letters.map((l) => l.id)).toEqual(['ada', 'ben'])
    expect(p.skipped).toEqual({ moved: 1, alreadySent: 1, heldBack: 1, unreachable: 1 })
  })

  it('a reminder still reaches someone who only had the announcement', () => {
    expect(plan('week', accounts, standings).letters.map((l) => l.id)).toEqual(['ada', 'ben', 'di'])
  })

  it('someone the new app hasn\'t heard of is asked to move', () => {
    expect(plan('announce', [account('zed')], {}).letters.map((l) => l.id)).toEqual(['zed'])
  })
})

describe('what each email says', () => {
  const [ada] = reachable(couple('ada', 'ben', 'p1'))
  const [solo] = reachable([account('cy')])

  it('asks a partner to tap too', () => {
    const l = compose('announce', ada, fresh, fresh)
    expect(l.subject).toBe('Sync in Love has a new home. Bring your account by 29 November')
    expect(l.text).toContain('Hi Ada,')
    expect(l.text).toContain('it’s still the two of you')
    expect(l.text).toContain('3. Ask Ben to tap too. Your shared days move once you both have.')
    expect(l.text).toContain('Bring my account: https://syncin.love/move')
    expect(l.text).toContain('until Monday 7 December')
  })

  it('says when their partner has already tapped', () => {
    const l = compose('week', ada, fresh, { state: 'waiting', partner: 'Ada', sent: [] })
    expect(l.subject).toBe('One week left to bring your Sync in Love account')
    expect(l.text).toContain('Ben has already tapped. Your shared days move as soon as you tap too.')
  })

  it('tells someone who tapped that it\'s their partner\'s turn', () => {
    const l = compose('last', ada, { state: 'waiting', partner: 'Ben', sent: [] }, fresh)
    expect(l.subject).toBe('Last day tomorrow: bring your Sync in Love account')
    expect(l.text).toContain('You’ve already tapped Bring my account. Ben hasn’t yet, and your shared days move once they do.')
    expect(l.text).not.toContain('1. Open syncin.love')
    expect(l.text).toContain('See where your move stands: https://syncin.love/move')
  })

  it('someone on their own gets no partner line', () => {
    const l = compose('announce', solo, fresh)
    expect(l.text).not.toContain('two of you')
    expect(l.text).not.toContain('3.')
    expect(l.text).toContain('2. Tap Bring my account.')
  })

  it('a name can\'t add markup to the email', () => {
    const [odd] = reachable([account('x', { firstName: '<img src=x onerror=alert(1)>' })])
    const l = compose('announce', odd, fresh)
    expect(l.html).not.toContain('<img')
    expect(l.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})
