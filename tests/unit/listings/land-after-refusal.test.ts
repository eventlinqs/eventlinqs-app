import { describe, expect, it } from 'vitest'
import { landableAfterRefusal } from '@/lib/listings/collect-store'

/*
 * THE 17:25 RUN OF 13 NOVEMBER 2026 failed two sources whole: listing_candidates_confidence refuses a 'low' row with no
 * reason, and a night held only by the capture rule's not yet migrated holds was left exactly that. Each case below is
 * checked against both database rules: listing_candidates_reasons_known and listing_candidates_confidence.
 */

const KNOWN = [
  'source_unverified', 'no_venue_address', 'midnight_start', 'called_off_words', 'time_changed', 'venue_changed',
  'similar_listing', 'judged_before_the_queue', 'offset_mismatch', 'no_time', 'implausible_time', 'multi_day_span',
  'link_unreached', 'canary_hold',
]
const passes = (r: { reasons: string[]; confidence: string }) =>
  r.reasons.every((x) => KNOWN.includes(x)) &&
  ((r.confidence === 'high' && r.reasons.length === 0) || (r.confidence === 'low' && r.reasons.length > 0))

describe('a night the database cannot yet hold with all its reasons', () => {
  it('held only by the capture rule: lands at high with no reason, waiting for a person (the 17:25 failure)', () => {
    const r = landableAfterRefusal(['venue_not_known'], 'low')
    expect(r).toEqual({ reasons: [], confidence: 'high' })
    expect(passes(r)).toBe(true)
  })

  it('held by the capture rule and a law 19 hold: keeps the hold, stays low', () => {
    const r = landableAfterRefusal(['venue_not_known', 'similar_listing'], 'low')
    expect(r).toEqual({ reasons: ['similar_listing'], confidence: 'low' })
    expect(passes(r)).toBe(true)
  })

  it('a later law 19 hold reads as midnight_start, once', () => {
    const r = landableAfterRefusal(['no_time', 'implausible_time', 'banned_words'], 'low')
    expect(r).toEqual({ reasons: ['midnight_start'], confidence: 'low' })
    expect(passes(r)).toBe(true)
  })
})
