import { describe, expect, it } from 'vitest'
import { lastCheckedInWords, seriesRuleInWords, seriesTimesInWords } from '@/lib/listings/series-words'

/**
 * WI2 Part 3a: a host's regular night in words, the sentence the venue page
 * shows under each night ("Every Wednesday, 7pm to 10pm").
 */
const base = { day: 3, starts_at: '19:00:00', ends_at: '22:00:00', anchor_date: '2026-10-28' }

describe('a regular night in words', () => {
  it('says each rule as a person would', () => {
    expect(seriesRuleInWords({ ...base, rule: 'weekly' })).toBe('Every Wednesday, 7pm to 10pm')
    expect(seriesRuleInWords({ ...base, rule: 'fortnightly' })).toBe('Every second Wednesday, 7pm to 10pm')
    expect(seriesRuleInWords({ ...base, rule: 'monthly-1' })).toBe('First Wednesday of the month, 7pm to 10pm')
    expect(seriesRuleInWords({ ...base, rule: 'monthly-3' })).toBe('Third Wednesday of the month, 7pm to 10pm')
    expect(seriesRuleInWords({ ...base, rule: 'monthly-last' })).toBe('Last Wednesday of the month, 7pm to 10pm')
    expect(seriesRuleInWords({ ...base, rule: 'once' })).toBe('Wednesday 28 October, 7pm to 10pm')
  })

  it('never invents a finish the source did not give', () => {
    expect(seriesTimesInWords({ starts_at: '19:30', ends_at: null })).toBe('from 7:30pm')
    expect(seriesRuleInWords({ ...base, ends_at: null, rule: 'weekly' })).toBe('Every Wednesday, from 7pm')
  })

  it('writes the half hour and midnight as the walk-in page does', () => {
    expect(seriesTimesInWords({ starts_at: '19:30:00', ends_at: '00:00:00' })).toBe('7:30pm to 12am')
  })

  it('says when the listing was last checked, or nothing', () => {
    expect(lastCheckedInWords('2026-10-18')).toBe('Last checked 18 October')
    expect(lastCheckedInWords(null)).toBeNull()
    expect(lastCheckedInWords('18 October')).toBeNull()
  })
})
