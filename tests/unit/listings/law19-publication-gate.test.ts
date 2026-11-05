import { describe, expect, it } from 'vitest'
import { planCandidates, type FoundEvent, type KnownEvent } from '@/lib/listings/collect'
import { judgeCandidate } from '@/lib/listings/judge'

/*
 * LAW 19 SECTION 7.3 (C:\dev\GROWTH\RELEASE-POLICY-5NOV.md): the publication gate in code, with a test for every rule in
 * section 4.2. A record is quarantined with a reason code, never published, when:
 *   (1) its start time is missing or uncertain            no_time, midnight_start, offset_mismatch (an unresolved zone)
 *   (2) its stated UTC offset disagrees with the venue's   offset_mismatch
 *   (3) its local start is implausible for its category   implausible_time
 *   (4) its date, local time or venue differs from the last verified value      time_changed, venue_changed
 *   (5) its booking link does not reach the stated seller  (not yet in the gate: named in BP-STATE, 6 November)
 *   (6) it duplicates a published event                    similar_listing, or one card with the second link
 * Rule (4)'s DATE half was open: a one-off night the source moved to ANOTHER DAY was planned as a new night, published
 * beside the old one. It is now a time change for a person.
 */
const NOW = new Date('2026-11-01T00:00:00Z')
const found = (over: Partial<FoundEvent> = {}): FoundEvent => ({
  title: 'Bp Brass Quintet', startsAt: '2026-11-07T08:30:00.000Z', endsAt: null, venueName: 'Costa Hall',
  venueAddress: 'Gheringhap St, Geelong VIC 3220', pageUrl: 'https://venue.example.com.au/brass', imageUrl: null,
  description: null, links: [], ...over,
})
const known = (over: Partial<KnownEvent> = {}): KnownEvent => ({
  eventId: 'e1', venueId: null, venueName: 'Costa Hall', venueAddress: 'Gheringhap St, Geelong VIC 3220',
  title: 'Bp Brass Quintet', startsAt: '2026-11-07T08:30:00.000Z', citySlug: 'geelong', seriesId: 's1', ...over,
})
const judge = (f: FoundEvent[], k: KnownEvent[]) =>
  planCandidates(f, k, NOW, 'geelong').map((plan) => ({ kind: plan.kind, ...judgeCandidate({ plan, sourceVerified: true, known: k }) }))

describe('LAW 19 section 4.2, rule by rule, through the one gate', () => {
  it('(1) a date with no time, or a midnight start, is held', () => {
    expect(judge([found({ startsAt: '2026-11-06T13:00:00.000Z', timeStatus: 'date_only' })], [])[0].reasons).toContain('no_time')
    expect(judge([found({ startsAt: '2026-11-06T13:00:00.000Z' })], [])[0].reasons).toContain('midnight_start')
  })
  it('(2) an offset the venue zone does not have is held', () => {
    expect(judge([found({ timeStatus: 'offset_mismatch' })], [])[0].reasons).toContain('offset_mismatch')
  })
  it('(3) a concert at 7:30 am read from a schema is held', () => {
    expect(judge([found({ title: 'Bp Concert', startsAt: '2026-11-06T20:30:00.000Z' })], [])[0].reasons).toContain('implausible_time')
  })
  it('(4) a listed night at another time that day, or at another venue, is held', () => {
    expect(judge([found({ startsAt: '2026-11-07T05:00:00.000Z' })], [known()])[0]).toMatchObject({ kind: 'changes_facts', reasons: ['time_changed'] })
    expect(judge([found({ venueName: 'GPAC Play House', venueAddress: '50 Little Malop St, Geelong VIC 3220' })], [known()])[0].reasons).toContain('venue_changed')
  })
  it('(4) a one-off night the source moved to another day is a time change, never a second night', () => {
    const r = judge([found({ startsAt: '2026-11-08T08:30:00.000Z' })], [known()])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'changes_facts', confidence: 'low', reasons: ['time_changed'] })
  })
  it('(4) a weekly night entering the horizon is new, never taken for a move', () => {
    const k = [known({ eventId: 'e6', startsAt: '2026-11-05T23:30:00.000Z' }), known({ eventId: 'e13', startsAt: '2026-11-12T23:30:00.000Z' })]
    const f = [found({ startsAt: '2026-11-12T23:30:00.000Z' }), found({ startsAt: '2026-11-19T23:30:00.000Z' })]
    expect(planCandidates(f, k, NOW, 'geelong').map((p) => p.kind)).toEqual(['adds_links', 'new'])
  })
  it('(6) the same night stated again is one card with the second link, never a second listing', () => {
    const r = judge([found({ links: [{ url: 'https://tickets.example.com.au/brass', availability: 'on_sale', priceFromCents: null }] })], [known()])
    expect(r[0].kind).toBe('adds_links')
  })
  it('a clean new night passes the gate', () => {
    expect(judge([found()], [])[0]).toMatchObject({ kind: 'new', confidence: 'high', reasons: [] })
  })
})
