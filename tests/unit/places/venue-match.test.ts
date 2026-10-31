import { describe, expect, test } from 'vitest'
import { matchVenue, type GooglePlace, type OurVenue } from '@/lib/places/venue-match'

/**
 * A GOOGLE PLACE IS OUR VENUE ONLY WHEN NAME, ADDRESS AND LOCATION ALL AGREE (the CONTROLLER's 17:55 (4) of
 * 31 October 2026: 'venue identity by verified name AND address AND location, never text alone where ambiguous').
 * A near miss is refused with its reason, so no other venue's photo can reach a page.
 */

const corner: OurVenue = { name: 'Corner Hotel', address: '57 Swan Street, Richmond VIC 3121', lat: -37.8253, lng: 144.9907 }
const place = (over: Partial<GooglePlace> = {}): GooglePlace => ({
  id: 'ChIJcorner',
  displayName: 'The Corner Hotel',
  formattedAddress: '57 Swan St, Richmond VIC 3121, Australia',
  lat: -37.82535,
  lng: 144.99075,
  ...over,
})

describe('the venue Google returns is ours', () => {
  test('name, street number, street and location agree: accepted, with its evidence', () => {
    const m = matchVenue(corner, place())
    expect(m.ok).toBe(true)
    if (m.ok) {
      expect(m.placeId).toBe('ChIJcorner')
      expect(m.evidence.metres).toBeLessThan(20)
      expect(m.evidence.address).toMatch(/57 swan/)
    }
  })

  test('a venue named without a street number matches on its street and suburb words', () => {
    const fed: OurVenue = { name: 'Federation Square', address: 'Swanston St & Flinders St, Melbourne VIC 3000', lat: -37.818, lng: 144.9691 }
    const m = matchVenue(fed, place({ id: 'ChIJfed', displayName: 'Federation Square', formattedAddress: 'Swanston St & Flinders St, Melbourne VIC 3000, Australia', lat: -37.8179, lng: 144.9690 }))
    expect(m.ok).toBe(true)
  })
})

describe('anything less is refused, with the reason', () => {
  test('the next door business at the same address is not our venue', () => {
    const m = matchVenue(corner, place({ displayName: 'Swan Street Pizza', formattedAddress: '57 Swan St, Richmond VIC 3121, Australia' }))
    expect(m).toEqual({ ok: false, reason: expect.stringMatching(/name/) })
  })

  test('the same name across town is not our venue', () => {
    const m = matchVenue(corner, place({ formattedAddress: '57 Swan St, Richmond VIC 3121, Australia', lat: -37.84, lng: 145.01 }))
    expect(m).toEqual({ ok: false, reason: expect.stringMatching(/metres/) })
  })

  test('a different street number is a different address', () => {
    const m = matchVenue(corner, place({ formattedAddress: '75 Swan St, Richmond VIC 3121, Australia' }))
    expect(m).toEqual({ ok: false, reason: expect.stringMatching(/address/) })
  })

  test('our venue with no address cannot be matched on name and location alone', () => {
    const m = matchVenue({ ...corner, address: null }, place())
    expect(m).toEqual({ ok: false, reason: expect.stringMatching(/no address/) })
  })

  test('a one word name never matches on that word inside a longer, different name', () => {
    const forum: OurVenue = { name: 'Forum', address: '154 Flinders Street, Melbourne VIC 3000', lat: -37.8166, lng: 144.9693 }
    const m = matchVenue(forum, place({ id: 'x', displayName: 'Forum Fitness Studio', formattedAddress: '154 Flinders St, Melbourne VIC 3000, Australia', lat: -37.8166, lng: 144.9693 }))
    expect(m.ok).toBe(false)
  })
})
