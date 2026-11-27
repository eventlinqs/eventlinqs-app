import { describe, expect, it } from 'vitest'
import { destinationFaults, IG_PAGE, type IntakeInput, type StatedFact } from '@/lib/creative/intake'
import { statedFacts } from '@/lib/social/studio-move'

/*
 * CAR S (the PM's 19:40 of 27 November 2026). Red on main, where the creative intake held both studio pieces at 19:30:
 * "[shape] It states the facts of each of its nights, once" (the studio wrote its facts in its own shape, never the
 * intake's, and the organiser as the engine names it cannot be written by hand) and "/ig does not list ..." (the profile's
 * /ig lists only nights already posted, so no piece waiting for approval could ever pass). Now the bridge states each
 * night as the engine reads it, after checking the studio's own stated start; and the intake judges a /ig link by what
 * the piece's own /ig page lists: its nights still ahead and public.
 */
const LISTED: StatedFact = { eventId: 'e1', title: 'J Cole', startDate: '2026-11-28T09:00:00Z', endDate: '2026-11-28T12:00:00Z', venue: 'Rod Laver Arena', organiser: null }
const read = new Map([[LISTED.eventId, LISTED]])

describe("the bridge states each night as the engine reads it", () => {
  it("takes the listing's own facts when the studio's stated start holds, in either shape it writes", () => {
    expect(statedFacts(['e1'], [{ event_id: 'e1', start: '2026-11-28T20:00:00+11:00', price: 'On sale' }], read)).toEqual({ facts: [LISTED] })
    expect(statedFacts(['e1'], [{ eventId: 'e1', startDate: '2026-11-28T09:00:00Z' }], read)).toEqual({ facts: [LISTED] })
  })
  it('refuses a night whose start the studio states otherwise, one it states nothing for, and one not public now', () => {
    expect(statedFacts(['e1'], [{ event_id: 'e1', start: '2026-11-28T19:30:00+11:00' }], read)).toEqual({ refused: 'the studio states J Cole starts 2026-11-28T19:30:00+11:00; the listing reads 2026-11-28T09:00:00Z' })
    expect(statedFacts(['e1'], [], read)).toEqual({ refused: 'the studio states no facts for J Cole' })
    expect(statedFacts(['e2'], [{ event_id: 'e2', start: '2026-11-28T09:00:00Z' }], read)).toEqual({ refused: 'its night e2 is not public now, so its facts cannot be stated' })
  })
})

describe("a /ig link is judged as the piece's own page", () => {
  // The record's own destinations too: destinationFaults reads each network's fit at its end (its 23:07 red: 'r.destinations
  // is not iterable' in this fixture, never in the code).
  const record = (link: string) => ({ link, eventIds: ['e1', 'e2'], destinations: ['instagram', 'facebook'] }) as unknown as IntakeInput
  const nights = new Map([['e1', { eventId: 'e1', slug: 'j-cole-2026-11-28', title: 'J Cole' }]]) as never
  const page = { ok: true, status: 200, body: '<html>no event links</html>' }
  const lines = (link: string) => destinationFaults(record(link), { instagram: '', facebook: '' }, { nights, page, misfits: new Map() }, { origin: 'https://www.eventlinqs.com.au', pieceId: null }).filter((l) => /list/.test(l))
  it('a night read public now is one /ig lists; one not public is named', () => {
    expect(IG_PAGE).toBe('/ig')
    expect(lines('https://www.eventlinqs.com.au/ig?utm_source=instagram')).toEqual(['[destination] /ig would not list the night e2: it is not public now.'])
  })
  it('any other page is still read for each night', () => {
    expect(lines('https://www.eventlinqs.com.au/city/melbourne')).toEqual(['[destination] /city/melbourne does not list J Cole, so the post would send people to a page without it.'])
  })
})
