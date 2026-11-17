/*
 * A NIGHT THAT HAS LEFT ITS SOURCE'S LIST IS HELD AT ONCE (the PM's 07:00 of 15 November 2026, item 4 (b): "This is the real
 * BRAZJAZ fix"). The fixed critical case BRAZJAZ (law 19 (c)): The JazzLab's list stopped carrying Sat 21 November, and the
 * night stayed public for days. src/lib/listings/left-source.ts decides; the collection run holds what it returns.
 */
import { describe, expect, it } from 'vitest'
import { nightsThatLeft, nightsBackOnTheList, LEFT_AT_ONCE_MAX } from '@/lib/listings/left-source'
import type { KnownEvent } from '@/lib/listings/collect'

const JAZZLAB = 'source-thejazzlab'
const night = (eventId: string, startsAt: string, over: Partial<KnownEvent> = {}): KnownEvent => ({
  eventId, title: eventId, startsAt, venueId: null, venueName: 'The JazzLab', venueAddress: '27 Leslie St, Brunswick VIC 3056',
  seriesId: `series-${eventId}`, listedPublic: true, sourceIds: [JAZZLAB], ...over,
})
const now = new Date('2026-11-15T00:00:00Z')

describe('the fixed critical case BRAZJAZ: a night that left its list', () => {
  const known = [
    night('brazjaz', '2026-11-21T09:00:00Z'),
    night('darcy', '2026-11-17T08:30:00Z'),
    night('vince', '2026-12-04T09:00:00Z'),
  ]
  it('is held when a complete read of its own source no longer carries it', () => {
    const v = nightsThatLeft({ sourceId: JAZZLAB, known, carried: new Set(['darcy', 'vince']), furthest: '2026-12-08T08:30:00Z', now })
    expect(v.kind).toBe('left')
    expect(v.kind === 'left' && v.nights.map((k) => k.eventId)).toEqual(['brazjaz'])
  })
  it('a night beyond the furthest night the list carried is never called gone', () => {
    const v = nightsThatLeft({ sourceId: JAZZLAB, known, carried: new Set(['darcy']), furthest: '2026-11-30T00:00:00Z', now })
    expect(v.kind === 'left' && v.nights.map((k) => k.eventId)).toEqual(['brazjaz'])
  })
  it('only its own source decides: another source never holds it, nor a night already hidden or passed', () => {
    expect(nightsThatLeft({ sourceId: 'source-other', known, carried: new Set(), furthest: '2026-12-31T00:00:00Z', now }).kind).toBe('none')
    const hidden = [night('brazjaz', '2026-11-21T09:00:00Z', { listedPublic: false })]
    expect(nightsThatLeft({ sourceId: JAZZLAB, known: hidden, carried: new Set(), furthest: '2026-12-31T00:00:00Z', now }).kind).toBe('none')
    const passed = [night('mambo', '2026-11-14T09:00:00Z')]
    expect(nightsThatLeft({ sourceId: JAZZLAB, known: passed, carried: new Set(), furthest: '2026-12-31T00:00:00Z', now }).kind).toBe('none')
  })
  it('a read that carried nothing holds nothing', () => {
    expect(nightsThatLeft({ sourceId: JAZZLAB, known, carried: new Set(), furthest: null, now }).kind).toBe('none')
  })
  it('a list that looks partial (most of its nights missing) holds nothing and says so', () => {
    const many = Array.from({ length: LEFT_AT_ONCE_MAX + 3 }, (_, i) => night(`n${i}`, `2026-11-${20 + i}T09:00:00Z`))
    const v = nightsThatLeft({ sourceId: JAZZLAB, known: many, carried: new Set(['n0']), furthest: '2026-12-31T00:00:00Z', now })
    expect(v).toEqual({ kind: 'partial', missing: many.length - 1, of: many.length })
  })
  it('a held night its list carries again is released', () => {
    expect(nightsBackOnTheList([{ eventId: 'brazjaz' }, { eventId: 'other' }], new Set(['brazjaz']))).toEqual(['brazjaz'])
  })
})
