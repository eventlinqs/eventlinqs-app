/*
 * ONE PLACE WRITTEN TWO WAYS IS ONE PLACE (the Event Discovery Engine, part (e); 13 November 2026). 137 nights waited for a
 * person as 'venue_changed' though each named the venue it is listed at, at the same start: read from production that day
 * ('Rod Laver Arena, Melbourne' against 'Rod Laver Arena'; 'The Play House' with its address written two ways). The same
 * night read again merges into its listing, and the engine closes the waiting ones; a real move stays a change.
 */
import { describe, expect, it } from 'vitest'
import { planCandidates, type FoundEvent } from '@/lib/listings/collect'
import { sameNightAlike, venuesAlike } from '@/lib/listings/venue-alike'
import { noChanges, NO_CHANGE } from '@/lib/listings/false-changes'

const START = '2026-11-15T08:30:00.000Z'

describe('one place written two ways', () => {
  it.each([
    [{ venueName: 'Rod Laver Arena, Melbourne', venueAddress: null }, { venueName: 'Rod Laver Arena', venueAddress: null }],
    [{ venueName: 'The Play House', venueAddress: '50 Little Malop Street, Geelong VIC 3220' }, { venueName: 'The Play House', venueAddress: 'Geelong Arts Centre, 50 Little Malop St' }],
    [{ venueName: 'Costa Hall', venueAddress: null }, { venueName: 'Costa Hall', venueAddress: 'Gheringhap Street' }],
    [{ venueName: 'Forum Melbourne', venueAddress: '154 Flinders Street' }, { venueName: 'The Forum', venueAddress: '154 Flinders St, Melbourne' }],
  ])('%o is %o', (a, b) => {
    expect(venuesAlike(a, b)).toBe(true)
  })

  it.each([
    [{ venueName: 'Rod Laver Arena', venueAddress: null }, { venueName: 'John Cain Arena', venueAddress: null }],
    [{ venueName: 'Costa Hall', venueAddress: '1 Gheringhap Street' }, { venueName: 'The Play House', venueAddress: '50 Little Malop Street' }],
    [{ venueName: 'Arts Centre Melbourne', venueAddress: null }, { venueName: 'Arts House', venueAddress: null }],
  ])('%o is not %o', (a, b) => {
    expect(venuesAlike(a, b)).toBe(false)
  })

  it('the same night needs the same minute and titles alike, as well as the place', () => {
    const k = { venueId: null, venueName: 'Rod Laver Arena', venueAddress: null, title: 'Khalid', startsAt: START }
    expect(sameNightAlike(k, { ...k, venueName: 'Rod Laver Arena, Melbourne' })).toBe(true)
    expect(sameNightAlike(k, { ...k, venueName: 'Rod Laver Arena, Melbourne', startsAt: '2026-11-15T09:30:00.000Z' })).toBe(false)
    expect(sameNightAlike(k, { ...k, venueName: 'Rod Laver Arena, Melbourne', title: 'Joji' })).toBe(false)
  })
})

describe('the collector merges the same night read again', () => {
  const now = new Date('2026-11-13T03:00:00Z')
  const found = (over: Partial<FoundEvent> = {}): FoundEvent => ({
    title: 'Khalid', startsAt: START, endsAt: null, venueName: 'Rod Laver Arena, Melbourne', venueAddress: null,
    pageUrl: 'https://www.rodlaverarena.com.au/events/khalid', imageUrl: null, description: null,
    links: [{ url: 'https://www.ticketmaster.com.au/khalid/e/1', availability: 'on_sale', priceFromCents: null }], ...over,
  })
  const known = [{ eventId: 'ev-k', venueId: null, venueName: 'Rod Laver Arena', venueAddress: null, title: 'Khalid', startsAt: START, citySlug: 'melbourne' }]

  it('its links are added to the listing, never a change held for a person', () => {
    expect(planCandidates([found()], known, now, 'melbourne')).toEqual([expect.objectContaining({ kind: 'adds_links', eventId: 'ev-k' })])
  })
  it('another venue at the same minute is still a change', () => {
    const plans = planCandidates([found({ venueName: 'John Cain Arena' })], known, now, 'melbourne')
    expect(plans).toEqual([expect.objectContaining({ kind: 'changes_facts', change: 'venue_changed', eventId: 'ev-k' })])
  })
})

describe('the engine closes the changes that were no change', () => {
  const listed = new Map([['ev-k', { id: 'ev-k', title: 'Khalid', start_date: START, venue_name: 'Rod Laver Arena', venue_address: null }]])
  const waiting = (over: Record<string, unknown> = {}) => ({ id: 'c1', event_id: 'ev-k', title: 'Khalid', venue_name: 'Rod Laver Arena, Melbourne', venue_address: null, starts_at: START, ...over })
  it('the same night at the same place written another way is closed; a real move and an unlisted one are not', () => {
    expect(noChanges([waiting(), waiting({ id: 'c2', venue_name: 'John Cain Arena' }), waiting({ id: 'c3', event_id: 'gone' })], listed)).toEqual(['c1'])
  })
  it('says why, in words', () => {
    expect(NO_CHANGE).toBe('the same night as its listing, read again: no change of venue')
  })
})
