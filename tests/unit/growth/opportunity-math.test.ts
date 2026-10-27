// The Event Opportunity Score's arithmetic (src/lib/growth/opportunity-math.ts; item 16 and the project manager's 21:19
// (3): five dimensions, each 0 to 20, equal weight, per event over 14 days against its city and category median, and
// "needs two weeks of numbers" until it has them).

import { describe, expect, test } from 'vitest'
import { hasTwoWeeks, median, partOf, scoreEvents, type Raw } from '@/lib/growth/opportunity-math'

const NOW = new Date('2026-10-27T10:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const raw = (n: number): Raw => ({ relevance: n, attention: n, engagement: n, conversion: n, health: n })

describe('one part, 0 to 20', () => {
  test('10 at the median, 20 at twice it or more, 0 at none, in proportion between', () => {
    expect(partOf(50, 50)).toBe(10)
    expect(partOf(100, 50)).toBe(20)
    expect(partOf(500, 50)).toBe(20)
    expect(partOf(0, 50)).toBe(0)
    expect(partOf(25, 50)).toBe(5)
  })
  test('where the peers have nothing: anything scores 20, nothing scores 10', () => {
    expect(partOf(3, 0)).toBe(20)
    expect(partOf(0, 0)).toBe(10)
  })
  test('the median of odd and even counts, and of none', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 3, 10])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})

describe('the score', () => {
  test('adds five equal parts against the event\'s own city and category, never another\'s', () => {
    const events = [
      { id: 'a', city: 'melbourne', category: 'music', publishedAt: daysAgo(20) },
      { id: 'b', city: 'melbourne', category: 'music', publishedAt: daysAgo(30) },
      { id: 'c', city: 'melbourne', category: 'music', publishedAt: daysAgo(15) },
      { id: 'd', city: 'geelong', category: 'music', publishedAt: daysAgo(40) },
    ]
    const scored = scoreEvents(events, new Map([['a', raw(10)], ['b', raw(20)], ['c', raw(40)], ['d', raw(1)]]), NOW)
    expect(scored.find((s) => s.id === 'b')).toMatchObject({ state: 'scored', score: 50 })
    expect(scored.find((s) => s.id === 'a')).toMatchObject({ state: 'scored', score: 25 })
    expect(scored.find((s) => s.id === 'c')).toMatchObject({ state: 'scored', score: 100 })
    // Geelong's one music event is its own median: 10 a part.
    expect(scored.find((s) => s.id === 'd')).toMatchObject({ state: 'scored', score: 50 })
  })

  test('says "needs two weeks" for an event published under 14 days ago or not published, and leaves it out of its peers', () => {
    const events = [
      { id: 'new', city: 'melbourne', category: 'music', publishedAt: daysAgo(3) },
      { id: 'draft', city: 'melbourne', category: 'music', publishedAt: null },
      { id: 'old', city: 'melbourne', category: 'music', publishedAt: daysAgo(21) },
    ]
    const scored = scoreEvents(events, new Map([['new', raw(1000)], ['old', raw(5)]]), NOW)
    expect(scored.map((s) => s.state)).toEqual(['needs_two_weeks', 'needs_two_weeks', 'scored'])
    expect(scored[2]).toMatchObject({ score: 50 })
    expect(hasTwoWeeks(daysAgo(14), NOW)).toBe(true)
    expect(hasTwoWeeks(daysAgo(13.9), NOW)).toBe(false)
  })
})
