import { describe, expect, it } from 'vitest'
import {
  QUESTIONS,
  SEQUENCE,
  questionForDay,
  questionById,
  withPartnerName,
} from '@/lib/questions/bank'
import { validatePayload } from '@/lib/questions/validate'
import type { Question } from '@/lib/questions/types'
import { scoreDirection, scoreFacet, scoreSync } from './score'
import {
  addDays,
  currentDayIndex,
  daysBetween,
  formatCountdown,
  isDayOpen,
  isValidTimeZone,
  localParts,
  openDayIndexes,
  secondsUntilRollover,
  streakFrom,
} from './day'

/** Deterministic PRNG so the calibration tests can't flake. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const FIXTURE: Question = {
  id: 'q-fixture',
  category: 'light',
  prompt: 'Fixture',
  facets: [
    {
      kind: 'choice',
      id: 'pick',
      ask: 'Pick',
      askAbout: 'Pick for {them}',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' },
      ],
    },
    {
      kind: 'scale',
      id: 'slide',
      ask: 'Slide',
      askAbout: 'Slide for {them}',
      minLabel: 'Low',
      maxLabel: 'High',
    },
  ],
}

describe('scoreFacet', () => {
  it('scores an exact choice match 100 and anything else 0', () => {
    expect(scoreFacet('choice', 'a', 'a')).toBe(100)
    expect(scoreFacet('choice', 'a', 'b')).toBe(0)
  })

  it('scores a scale on doubled distance, floored at zero', () => {
    expect(scoreFacet('scale', 50, 50)).toBe(100)
    expect(scoreFacet('scale', 50, 45)).toBe(90)
    expect(scoreFacet('scale', 50, 40)).toBe(80)
    expect(scoreFacet('scale', 50, 25)).toBe(50)
    expect(scoreFacet('scale', 0, 50)).toBe(0)
    expect(scoreFacet('scale', 0, 100)).toBe(0)
  })

  it('is symmetric — who guessed does not change the distance', () => {
    expect(scoreFacet('scale', 30, 70)).toBe(scoreFacet('scale', 70, 30))
  })

  it('clamps out-of-range scale values instead of producing negatives', () => {
    expect(scoreFacet('scale', -40, 0)).toBe(100)
    expect(scoreFacet('scale', 400, 100)).toBe(100)
  })

  it('scores a skipped facet zero rather than throwing', () => {
    expect(scoreFacet('choice', undefined, 'a')).toBe(0)
    expect(scoreFacet('scale', 50, undefined)).toBe(0)
  })
})

describe('score calibration', () => {
  const IDS = ['a', 'b', 'c', 'd']

  /** Mean sync score for two people answering a question at random. */
  function randomBaseline(question: Question, seed: number, n = 20_000): number {
    const rand = lcg(seed)
    const answer = () => {
      const payload: Record<string, string | number> = {}
      for (const facet of question.facets) {
        payload[facet.id] =
          facet.kind === 'choice'
            ? facet.options[Math.floor(rand() * facet.options.length)].id
            : Math.floor(rand() * 101)
      }
      return payload
    }
    let total = 0
    for (let i = 0; i < n; i++) {
      total += scoreSync(
        question,
        { self: answer(), guess: answer() },
        { self: answer(), guess: answer() },
      ).sync
    }
    return total / n
  }

  // Doubling the scale distance is what keeps this honest. Plain `100 - d`
  // leaves a random guesser at 66 and every couple looks psychic.
  it('puts a random scale guesser at 41, not 66', () => {
    const rand = lcg(1)
    let total = 0
    const n = 20_000
    for (let i = 0; i < n; i++) {
      total += scoreFacet('scale', Math.floor(rand() * 101), Math.floor(rand() * 101))
    }
    expect(total / n).toBeGreaterThan(39)
    expect(total / n).toBeLessThan(44)
  })

  it('puts a random 4-option choice guesser near 25', () => {
    const rand = lcg(2)
    let total = 0
    const n = 20_000
    for (let i = 0; i < n; i++) {
      total += scoreFacet('choice', IDS[Math.floor(rand() * 4)], IDS[Math.floor(rand() * 4)])
    }
    expect(total / n).toBeGreaterThan(22)
    expect(total / n).toBeLessThan(28)
  })

  // The property that actually protects the product: a couple answering at
  // random lands near a third, nowhere near a score they'd be proud of.
  it('leaves a random couple near 33 on a real question', () => {
    for (const question of QUESTIONS) {
      const baseline = randomBaseline(question, 7, 4_000)
      expect(baseline, question.id).toBeGreaterThan(26)
      expect(baseline, question.id).toBeLessThan(42)
    }
  })

  // And the other half of that: reading each other well has to be worth
  // markedly more than chance, or the score carries no information.
  it('rewards an attuned couple far above chance', () => {
    const rand = lcg(11)
    let total = 0
    const n = 4_000
    for (let i = 0; i < n; i++) {
      // Both guess right on the choice and land within 10 on the slider.
      const pick = IDS[Math.floor(rand() * 4)]
      const aSlide = Math.floor(rand() * 101)
      const bSlide = Math.floor(rand() * 101)
      const jitter = () => Math.floor(rand() * 21) - 10
      total += scoreSync(
        FIXTURE,
        { self: { pick, slide: aSlide }, guess: { pick, slide: bSlide + jitter() } },
        { self: { pick, slide: bSlide }, guess: { pick, slide: aSlide + jitter() } },
      ).sync
    }
    expect(total / n).toBeGreaterThan(80)
  })
})

describe('scoreDirection', () => {
  it('averages facets equally', () => {
    const result = scoreDirection(
      FIXTURE,
      { pick: 'a', slide: 50 },
      { pick: 'a', slide: 40 }, // 100 and 80
    )
    expect(result.total).toBe(90)
    expect(result.facets.map((f) => f.score)).toEqual([100, 80])
  })

  it('returns a perfect score only on a perfect read', () => {
    expect(scoreDirection(FIXTURE, { pick: 'c', slide: 12 }, { pick: 'c', slide: 12 }).total).toBe(100)
  })

  it('carries both values through for the reveal to render', () => {
    const [choice] = scoreDirection(FIXTURE, { pick: 'a', slide: 1 }, { pick: 'b', slide: 1 }).facets
    expect(choice.truth).toBe('a')
    expect(choice.guess).toBe('b')
  })
})

describe('scoreSync', () => {
  const a = { self: { pick: 'a', slide: 80 }, guess: { pick: 'b', slide: 30 } }
  const b = { self: { pick: 'b', slide: 20 }, guess: { pick: 'a', slide: 70 } }

  it('scores each direction against the other person’s truth', () => {
    const result = scoreSync(FIXTURE, a, b)
    // A guessed B: pick b vs truth b = 100, slide 30 vs truth 20 = 80 → 90
    expect(result.aReadB.total).toBe(90)
    // B guessed A: pick a vs truth a = 100, slide 70 vs truth 80 = 80 → 90
    expect(result.bReadA.total).toBe(90)
    expect(result.sync).toBe(90)
  })

  it('produces one number for the couple regardless of argument order', () => {
    const forward = scoreSync(FIXTURE, a, b)
    const backward = scoreSync(FIXTURE, b, a)
    expect(forward.sync).toBe(backward.sync)
  })

  it('does not average away a lopsided day — it reports both sides', () => {
    const attuned = { self: { pick: 'a', slide: 50 }, guess: { pick: 'b', slide: 20 } }
    // Wrong option, and a full 50 points out on the slider — the floor bites.
    const oblivious = { self: { pick: 'b', slide: 20 }, guess: { pick: 'c', slide: 100 } }
    const result = scoreSync(FIXTURE, attuned, oblivious)
    expect(result.aReadB.total).toBe(100)
    expect(result.bReadA.total).toBe(0)
    expect(result.sync).toBe(50)
  })
})

describe('agreement with the database scoring function', () => {
  // Scoring exists twice — here, and in plpgsql inside submit_answer(), which is
  // the authority because it is the only thing that can see both answers. These
  // are the exact fixtures asserted in supabase/tests/phase1_flow.sql, pinned
  // here so the two implementations cannot drift apart silently.
  it('matches the SQL fixture exactly', () => {
    const sleep = questionById('q-sleep')!
    const alice = {
      self: { quality: 80, culprit: 'nothing' },
      guess: { quality: 40, culprit: 'brain' },
    }
    const bob = {
      self: { quality: 30, culprit: 'brain' },
      guess: { quality: 90, culprit: 'noise' },
    }

    const result = scoreSync(sleep, alice, bob)

    expect(result.aReadB.total).toBe(90) // |40-30|=10 → 80, brain==brain → 100
    expect(result.bReadA.total).toBe(40) // |90-80|=10 → 80, noise≠nothing → 0
    expect(result.sync).toBe(65)
  })
})

describe('question bank integrity', () => {
  it('has 30 questions and a sequence that covers every one exactly once', () => {
    expect(QUESTIONS).toHaveLength(30)
    expect(SEQUENCE).toHaveLength(30)
    expect(new Set(SEQUENCE).size).toBe(30)
    expect([...SEQUENCE].sort()).toEqual(QUESTIONS.map((q) => q.id).sort())
  })

  it('has unique question ids', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length)
  })

  it('gives every question at least one scale facet', () => {
    // Without one, a day can only score 0/50/100 per direction and the number
    // reads as random rather than earned.
    for (const q of QUESTIONS) {
      expect(q.facets.some((f) => f.kind === 'scale'), `${q.id} has no scale facet`).toBe(true)
    }
  })

  it('gives every question two or three facets with unique ids', () => {
    for (const q of QUESTIONS) {
      expect(q.facets.length, q.id).toBeGreaterThanOrEqual(2)
      expect(q.facets.length, q.id).toBeLessThanOrEqual(3)
      expect(new Set(q.facets.map((f) => f.id)).size, q.id).toBe(q.facets.length)
    }
  })

  it('gives every choice facet 3-4 options with unique ids', () => {
    for (const q of QUESTIONS) {
      for (const facet of q.facets) {
        if (facet.kind !== 'choice') continue
        expect(facet.options.length, `${q.id}/${facet.id}`).toBeGreaterThanOrEqual(3)
        expect(facet.options.length, `${q.id}/${facet.id}`).toBeLessThanOrEqual(4)
        expect(new Set(facet.options.map((o) => o.id)).size).toBe(facet.options.length)
      }
    }
  })

  it('templates the partner name in every askAbout string', () => {
    for (const q of QUESTIONS) {
      for (const facet of q.facets) {
        expect(facet.askAbout, `${q.id}/${facet.id}`).toContain('{them}')
      }
    }
  })

  it('keeps the first week light — no deep questions before day 3', () => {
    // A pair whose second question is "what do you suspect I don't know about
    // you" does not come back for a third.
    for (let day = 0; day < 3; day++) {
      expect(questionForDay(day).category, `day ${day}`).not.toBe('deep')
    }
  })

  it('opens on the same question for every pair', () => {
    expect(questionForDay(0).id).toBe(SEQUENCE[0])
  })

  it('is a pure function of the day index, and wraps', () => {
    expect(questionForDay(5).id).toBe(questionForDay(5).id)
    expect(questionForDay(0).id).toBe(questionForDay(30).id)
    expect(questionForDay(31).id).toBe(questionForDay(1).id)
  })

  it('survives a negative day index rather than crashing', () => {
    expect(() => questionForDay(-1)).not.toThrow()
  })

  it('resolves every sequence id to a real question', () => {
    for (const id of SEQUENCE) {
      expect(questionById(id), id).toBeDefined()
    }
  })
})

describe('withPartnerName', () => {
  it('substitutes the name', () => {
    expect(withPartnerName('How is {them} today?', 'Ada')).toBe('How is Ada today?')
  })

  it('falls back to something neutral before pairing', () => {
    expect(withPartnerName('Ask {them}', null)).toBe('Ask your partner')
    expect(withPartnerName('Ask {them}', '   ')).toBe('Ask your partner')
  })
})

describe('validatePayload', () => {
  it('accepts a well-formed payload', () => {
    const result = validatePayload(FIXTURE, { pick: 'b', slide: 40 })
    expect(result).toEqual({ ok: true, value: { pick: 'b', slide: 40 } })
  })

  it('rejects an unknown choice id', () => {
    const result = validatePayload(FIXTURE, { pick: 'z', slide: 40 })
    expect(result.ok).toBe(false)
  })

  it('rejects a missing facet', () => {
    expect(validatePayload(FIXTURE, { pick: 'a' }).ok).toBe(false)
    expect(validatePayload(FIXTURE, { slide: 10 }).ok).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(validatePayload(FIXTURE, null).ok).toBe(false)
    expect(validatePayload(FIXTURE, 'a').ok).toBe(false)
    expect(validatePayload(FIXTURE, []).ok).toBe(false)
  })

  it('clamps and rounds out-of-range scale values rather than rejecting', () => {
    const result = validatePayload(FIXTURE, { pick: 'a', slide: 900 })
    expect(result).toEqual({ ok: true, value: { pick: 'a', slide: 100 } })
    const low = validatePayload(FIXTURE, { pick: 'a', slide: -5 })
    expect(low).toEqual({ ok: true, value: { pick: 'a', slide: 0 } })
  })

  it('coerces a numeric string, since form values arrive as strings', () => {
    expect(validatePayload(FIXTURE, { pick: 'a', slide: '73' })).toEqual({
      ok: true,
      value: { pick: 'a', slide: 73 },
    })
  })

  it('drops unknown keys instead of failing', () => {
    const result = validatePayload(FIXTURE, { pick: 'a', slide: 10, injected: 'x' })
    expect(result).toEqual({ ok: true, value: { pick: 'a', slide: 10 } })
  })
})

describe('date helpers', () => {
  it('counts days between plain dates', () => {
    expect(daysBetween('2026-07-29', '2026-07-29')).toBe(0)
    expect(daysBetween('2026-07-29', '2026-07-30')).toBe(1)
    expect(daysBetween('2026-07-29', '2026-08-05')).toBe(7)
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1) // 2026 is not a leap year
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // 2024 is
  })

  it('adds days across a month boundary', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('validates timezones', () => {
    expect(isValidTimeZone('Africa/Lagos')).toBe(true)
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})

describe('localParts', () => {
  it('reads the wall clock in the given zone', () => {
    const at = new Date('2026-07-29T23:30:00Z')
    expect(localParts(at, 'UTC')).toMatchObject({ date: '2026-07-29', hour: 23, minute: 30 })
    // Lagos is UTC+1 — already tomorrow.
    expect(localParts(at, 'Africa/Lagos')).toMatchObject({ date: '2026-07-30', hour: 0, minute: 30 })
    // Los Angeles is UTC-7 in July — still yesterday afternoon.
    expect(localParts(at, 'America/Los_Angeles')).toMatchObject({ date: '2026-07-29', hour: 16 })
  })

  it('reports midnight as hour 0, never 24', () => {
    expect(localParts(new Date('2026-07-29T00:00:00Z'), 'UTC').hour).toBe(0)
  })
})

describe('the pair calendar', () => {
  const dayZero = '2026-07-29'

  it('counts the pairing day as day 0', () => {
    expect(currentDayIndex(new Date('2026-07-29T10:00:00Z'), dayZero, 'UTC')).toBe(0)
  })

  it('advances at pair-local midnight', () => {
    expect(currentDayIndex(new Date('2026-07-29T23:59:00Z'), dayZero, 'UTC')).toBe(0)
    expect(currentDayIndex(new Date('2026-07-30T00:01:00Z'), dayZero, 'UTC')).toBe(1)
  })

  // This is the reason a couple shares one timezone instead of each having
  // their own. Same instant, two zones, two different question numbers.
  it('would desynchronise a couple if each partner used their own zone', () => {
    const at = new Date('2026-07-30T04:00:00Z')
    const lagos = currentDayIndex(at, dayZero, 'Africa/Lagos')
    const la = currentDayIndex(at, dayZero, 'America/Los_Angeles')
    expect(lagos).toBe(1)
    expect(la).toBe(0)
    expect(lagos).not.toBe(la)
  })
})

describe('the 30-hour answer window', () => {
  const dayZero = '2026-07-29'

  it('offers only today’s question during normal hours', () => {
    expect(openDayIndexes(new Date('2026-07-30T12:00:00Z'), dayZero, 'UTC')).toEqual([1])
  })

  it('keeps yesterday’s question open until 06:00 local', () => {
    // 01:00 — the partner who was asleep at the rollover can still answer.
    expect(openDayIndexes(new Date('2026-07-30T01:00:00Z'), dayZero, 'UTC')).toEqual([1, 0])
    // 05:59 — just inside.
    expect(openDayIndexes(new Date('2026-07-30T05:59:00Z'), dayZero, 'UTC')).toEqual([1, 0])
    // 06:00 — shut.
    expect(openDayIndexes(new Date('2026-07-30T06:00:00Z'), dayZero, 'UTC')).toEqual([1])
  })

  // The midnight cliff: one partner answers at 23:55, the other is asleep.
  // Without grace, the day turns over on an orphaned answer and the streak dies
  // through nobody's fault.
  it('lets a late second answer still land on the same question', () => {
    const firstAnswerAt = new Date('2026-07-29T23:55:00Z')
    const secondAnswerAt = new Date('2026-07-30T02:20:00Z')
    const day = currentDayIndex(firstAnswerAt, dayZero, 'UTC')
    expect(day).toBe(0)
    expect(isDayOpen(day, secondAnswerAt, dayZero, 'UTC')).toBe(true)
  })

  it('does not offer a negative day index on the pair’s first night', () => {
    expect(openDayIndexes(new Date('2026-07-29T02:00:00Z'), dayZero, 'UTC')).toEqual([0])
  })

  it('closes a question that is two days stale', () => {
    expect(isDayOpen(0, new Date('2026-08-01T12:00:00Z'), dayZero, 'UTC')).toBe(false)
  })

  it('holds up across a DST spring-forward', () => {
    // New York loses 02:00-03:00 on 2026-03-08. Both instants are inside grace.
    const zero = '2026-03-07'
    expect(openDayIndexes(new Date('2026-03-08T06:30:00Z'), zero, 'America/New_York')).toEqual([1, 0])
    expect(openDayIndexes(new Date('2026-03-08T07:30:00Z'), zero, 'America/New_York')).toEqual([1, 0])
    // 07:30 local, past grace.
    expect(openDayIndexes(new Date('2026-03-08T11:30:00Z'), zero, 'America/New_York')).toEqual([1])
  })
})

describe('secondsUntilRollover', () => {
  it('counts down to pair-local midnight', () => {
    expect(secondsUntilRollover(new Date('2026-07-29T23:00:00Z'), 'UTC')).toBe(3600)
    expect(secondsUntilRollover(new Date('2026-07-29T00:00:00Z'), 'UTC')).toBe(86_400)
  })

  it('is computed in the pair’s zone, not the viewer’s', () => {
    // 23:00 UTC is 00:00 in Lagos — a full day left, not one hour.
    expect(secondsUntilRollover(new Date('2026-07-29T23:00:00Z'), 'Africa/Lagos')).toBe(86_400)
  })
})

describe('formatCountdown', () => {
  it('reads like a human wrote it', () => {
    expect(formatCountdown(22_320)).toBe('6h 12m')
    expect(formatCountdown(2_880)).toBe('48m')
    expect(formatCountdown(40)).toBe('40s')
    expect(formatCountdown(0)).toBe('0s')
    expect(formatCountdown(-5)).toBe('0s')
  })
})

describe('streakFrom', () => {
  it('counts consecutive completed questions back from the latest', () => {
    expect(streakFrom([0, 1, 2, 3])).toBe(4)
    expect(streakFrom([3, 1, 0, 2])).toBe(4) // order-independent
  })

  it('is zero with nothing completed', () => {
    expect(streakFrom([])).toBe(0)
  })

  it('stops at the first gap', () => {
    expect(streakFrom([0, 1, 2, 5, 6])).toBe(2)
  })

  it('counts a single completed day as one', () => {
    expect(streakFrom([7])).toBe(1)
  })

  it('ignores duplicates', () => {
    expect(streakFrom([4, 4, 5, 5, 6])).toBe(3)
  })

  // Counting completed questions rather than calendar days is what makes the
  // 30-hour grace window meaningful — answering at 01:00 must not break a run.
  it('does not care when in the window the answers landed', () => {
    expect(streakFrom([10, 11, 12])).toBe(3)
  })
})
