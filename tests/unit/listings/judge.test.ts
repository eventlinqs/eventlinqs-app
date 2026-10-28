import { describe, expect, it } from 'vitest'
import { factChange, judgeCandidate } from '@/lib/listings/judge'
import { planCandidates, type FoundEvent, type KnownEvent } from '@/lib/listings/collect'

/*
 * The exception queue's judge (the engine plan's part E): a found night is high confidence only when nothing about it
 * needs a person. Every reason is stated, so the queue says why a row waits, and a changed time or venue on a night
 * EventLinqs already lists is never a second card and never applied without a person.
 */

const NOW = new Date('2026-10-28T09:00:00Z')

const found = (over: Partial<FoundEvent> = {}): FoundEvent => ({
  title: 'Bp Proof Trio',
  startsAt: '2026-11-14T20:00:00+11:00',
  endsAt: '2026-11-14T23:00:00+11:00',
  venueName: 'The Barwon Club',
  venueAddress: '509 Moorabool St, Geelong',
  pageUrl: 'https://club.example.com.au/gigs/bp-trio',
  imageUrl: null,
  description: null,
  links: [],
  ...over,
})

const listed = (over: Partial<KnownEvent> = {}): KnownEvent => ({
  eventId: 'e-1',
  venueId: null,
  venueName: 'The Barwon Club',
  venueAddress: '509 Moorabool St, Geelong',
  title: 'Bp Proof Trio',
  startsAt: '2026-11-14T20:00:00+11:00',
  ...over,
})

function judge(e: FoundEvent, known: KnownEvent[] = [], sourceVerified = true) {
  const [plan] = planCandidates([e], known, NOW)
  return judgeCandidate({ plan, sourceVerified, known })
}

describe('judging a found night', () => {
  it('is high confidence with no reasons when a verified source gives a whole, plain night', () => {
    expect(judge(found())).toEqual({ confidence: 'high', reasons: [] })
  })

  it('is low when its source is not verified', () => {
    expect(judge(found(), [], false)).toEqual({ confidence: 'low', reasons: ['source_unverified'] })
  })

  it('is low when the venue has no address', () => {
    expect(judge(found({ venueAddress: null }))).toEqual({ confidence: 'low', reasons: ['no_venue_address'] })
  })

  it('is low when it starts at midnight in Melbourne, the mark of a date with no time', () => {
    expect(judge(found({ startsAt: '2026-11-14T00:00:00+11:00', endsAt: null }))).toEqual({ confidence: 'low', reasons: ['midnight_start'] })
  })

  it('is low when its own words say it is cancelled, postponed or rescheduled', () => {
    expect(judge(found({ title: 'CANCELLED: Bp Proof Trio' })).reasons).toEqual(['called_off_words'])
    expect(judge(found({ description: 'This show has been postponed to 2027.' })).reasons).toEqual(['called_off_words'])
    expect(judge(found({ title: 'Rescheduled - Bp Proof Trio' })).reasons).toEqual(['called_off_words'])
  })

  it('is low when a different but alike night is listed at the same venue that day', () => {
    const r = judge(found({ title: 'Bp Proof Trio and Friends Late Session' }), [listed({ title: 'Proof Quartet Late Night Jazz Special Guests Downstairs', startsAt: '2026-11-14T15:00:00+11:00' })])
    expect(r).toEqual({ confidence: 'low', reasons: ['similar_listing'] })
  })

  it('gives every reason that applies, not only the first', () => {
    expect(judge(found({ venueAddress: null, startsAt: '2026-11-14T00:00:00+11:00', endsAt: null }), [], false).reasons).toEqual([
      'source_unverified',
      'no_venue_address',
      'midnight_start',
    ])
  })
})

describe('a changed fact on a night already listed', () => {
  it('a time moved on the same day is a fact change for that event, never a second card', () => {
    const k = listed()
    const moved = found({ startsAt: '2026-11-14T22:30:00+11:00', endsAt: null })
    expect(factChange(moved, [k])).toEqual({ eventId: 'e-1', change: 'time_changed' })
    const [plan] = planCandidates([moved], [k], NOW)
    expect(plan).toMatchObject({ kind: 'changes_facts', eventId: 'e-1', change: 'time_changed' })
    expect(judgeCandidate({ plan, sourceVerified: true, known: [k] })).toEqual({ confidence: 'low', reasons: ['time_changed'] })
  })

  it('a venue moved at the same start is a fact change', () => {
    const k = listed()
    const moved = found({ venueName: 'Costa Hall', venueAddress: '1 Gheringhap St, Geelong' })
    expect(factChange(moved, [k])).toEqual({ eventId: 'e-1', change: 'venue_changed' })
  })

  it('next week at the same venue is a new night of a series, not a moved one', () => {
    expect(factChange(found({ startsAt: '2026-11-21T20:00:00+11:00', endsAt: null }), [listed()])).toBeNull()
  })

  it('the same night unchanged is no fact change (it adds links or is nothing)', () => {
    expect(factChange(found(), [listed()])).toBeNull()
  })
})
