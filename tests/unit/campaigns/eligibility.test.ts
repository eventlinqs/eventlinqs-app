// The campaign eligibility engine (D1 of Lawal's DemandOS directive of 30 October 2026, section 1, and the blueprint's three
// promotion levels). Pinned: every event is judged on the directive's nine points, each saying why in words; a listing is
// Discovery only while its facts and destination hold; Featured needs approved imagery of the night or its venue and a
// known audience; Performance needs a sale we can verify, lead time and viable economics; and no level is ever promised
// to every event.

import { describe, expect, test } from 'vitest'
import { judgeEvent, levelCounts, PERFORMANCE_MIN_DAYS, PERFORMANCE_MIN_POTENTIAL_CENTS, type EligibilityFacts } from '@/lib/campaigns/eligibility'

const NOW = new Date('2026-11-01T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const days = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString()

const facts = (over: Partial<EligibilityFacts> = {}): EligibilityFacts => ({
  status: 'published',
  visibility: 'public',
  startDate: days(30),
  endDate: days(30.2),
  venueName: 'Costa Hall',
  city: 'Geelong',
  categoryKnown: true,
  ctaState: 'paid_native',
  destinationDead: false,
  soldOut: false,
  media: 'organiser',
  potentialFeeCents: PERFORMANCE_MIN_POTENTIAL_CENTS,
  ...over,
})

const failed = (f: EligibilityFacts) => judgeEvent(f, NOW).checks.filter((c) => !c.ok).map((c) => c.point)

describe('the nine points', () => {
  test('every event is judged on all nine, each in words', () => {
    const { checks } = judgeEvent(facts(), NOW)
    expect(checks.map((c) => c.point)).toEqual(['status', 'time', 'venue', 'media', 'ticketing', 'availability', 'audience', 'viability', 'attribution'])
    for (const c of checks) expect(c.words.length).toBeGreaterThan(5)
  })
})

describe('no level', () => {
  test.each([
    ['a draft', { status: 'draft' }, 'status'],
    ['a private night', { visibility: 'private' }, 'status'],
    ['a night that has ended', { startDate: days(-2), endDate: days(-1) }, 'time'],
    ['a night with no venue', { venueName: null }, 'venue'],
    ['a night with no city', { city: null }, 'venue'],
    ['a dead booking link', { ctaState: 'paid_external' as const, destinationDead: true }, 'ticketing'],
  ])('%s is not promoted at all', (_, over, point) => {
    const j = judgeEvent(facts(over), NOW)
    expect(j.level).toBeNull()
    expect(failed(facts(over))).toContain(point)
  })
})

describe('Discovery', () => {
  test('a verified listing with no approved photograph is still listed (K1: no permission to use a photo is not no permission to talk about the event)', () => {
    expect(judgeEvent(facts({ media: null }), NOW).level).toBe('discovery')
  })

  test('an unknown price is still listed, and never read as free', () => {
    const j = judgeEvent(facts({ ctaState: 'unknown_price', media: null }), NOW)
    expect(j.level).toBe('discovery')
    expect(j.checks.find((c) => c.point === 'ticketing')?.words).not.toMatch(/free/i)
  })

  test('a sold out night stays listed but is not featured', () => {
    expect(judgeEvent(facts({ soldOut: true }), NOW).level).toBe('discovery')
  })

  test('an unknown category keeps it from Featured', () => {
    expect(judgeEvent(facts({ categoryKnown: false }), NOW).level).toBe('discovery')
  })
})

describe('Featured', () => {
  test('an approved photograph of the night or of its actual venue, and a known audience', () => {
    expect(judgeEvent(facts({ ctaState: 'free_open', potentialFeeCents: null }), NOW).level).toBe('featured')
    expect(judgeEvent(facts({ ctaState: 'paid_external', potentialFeeCents: null, media: 'venue' }), NOW).level).toBe('featured')
  })
})

describe('Performance', () => {
  test('our own ticketing, enough lead time and viable economics', () => {
    expect(judgeEvent(facts(), NOW).level).toBe('performance')
  })

  test('an outside sale cannot be verified, so it never qualifies', () => {
    const j = judgeEvent(facts({ ctaState: 'paid_external' }), NOW)
    expect(j.level).toBe('featured')
    expect(j.checks.find((c) => c.point === 'attribution')?.ok).toBe(false)
  })

  test('a free night has nothing to convert', () => {
    expect(judgeEvent(facts({ ctaState: 'free_registration', potentialFeeCents: 0 }), NOW).level).toBe('featured')
  })

  test('too close to its date', () => {
    expect(judgeEvent(facts({ startDate: days(PERFORMANCE_MIN_DAYS - 1), endDate: days(PERFORMANCE_MIN_DAYS) }), NOW).level).toBe('featured')
  })

  test('too little left to earn, or not known, never guessed', () => {
    expect(judgeEvent(facts({ potentialFeeCents: PERFORMANCE_MIN_POTENTIAL_CENTS - 1 }), NOW).level).toBe('featured')
    expect(judgeEvent(facts({ potentialFeeCents: null }), NOW).level).toBe('featured')
  })
})

describe('the counts', () => {
  test('say each level and those with none', () => {
    const counts = levelCounts([facts(), facts({ media: null }), facts({ media: null }), facts({ status: 'draft' })].map((f) => judgeEvent(f, NOW)))
    expect(counts).toEqual({ performance: 1, featured: 0, discovery: 2, none: 1 })
  })
})
