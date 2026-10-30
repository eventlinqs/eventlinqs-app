// Each partner venue's own tracked code and printable QR (the project manager's 17:25 of 30 October 2026, D3). Pinned: the
// printed address carries the venue's id, so a rename never breaks it; a press lands on the venue's page on this site,
// never anywhere else; a dropped venue lands on the one it merged into; an unknown one on /events (Law 5); and the sheet
// is one A5 page whatever the venue's name.

import { describe, expect, test } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { followVenue, venueGoDestination, venueGoUrl, venueViaOf } from '@/lib/venues/venue-go-math'
import { buildVenueQrSheet } from '@/lib/venues/venue-qr-sheet'

const ID = '4a969803-0724-4f25-a846-a8a9cad2a3e4'
const KEPT = '9a7d0142-d8ce-4977-8c9c-4531d756fdec'

describe('the printed address', () => {
  test('names the venue by id and says it was scanned', () => {
    expect(venueGoUrl(ID, 'https://www.eventlinqs.com.au')).toBe(`https://www.eventlinqs.com.au/go/v/${ID}?via=qr`)
  })

  test('a press names qr only when its link says so', () => {
    expect(venueViaOf('qr')).toBe('qr')
    expect(venueViaOf(null)).toBe('link')
    expect(venueViaOf('poster')).toBe('link')
  })
})

describe('where a press lands', () => {
  test('on the venue page on this site, its way in named', () => {
    const to = new URL(venueGoDestination('Geelong City Market', 'https://www.eventlinqs.com.au', 'qr'))
    expect(to.origin + to.pathname).toBe('https://www.eventlinqs.com.au/venues/geelong-city-market')
    expect(to.searchParams.get('utm_source')).toBe('venue')
    expect(to.searchParams.get('utm_medium')).toBe('qr')
    expect(to.searchParams.get('utm_campaign')).toBe('venue_go')
  })

  test('on /events for a venue nobody knows', () => {
    expect(new URL(venueGoDestination(null, 'https://www.eventlinqs.com.au', 'link')).pathname).toBe('/events')
  })

  test('on /events for a name that makes no address', () => {
    expect(new URL(venueGoDestination('!!!', 'https://www.eventlinqs.com.au', 'link')).pathname).toBe('/events')
  })
})

describe('which venue a printed code means', () => {
  const venues = new Map([
    [ID, { id: ID, name: 'Barwon Events', removed: true }],
    [KEPT, { id: KEPT, name: 'Geelong City Market', removed: false }],
  ])
  const deps = (merged: Record<string, string>) => ({
    venue: async (id: string) => venues.get(id) ?? null,
    mergedInto: async (id: string) => merged[id] ?? null,
  })

  test('a live venue is itself', async () => {
    expect((await followVenue(KEPT, deps({})))?.name).toBe('Geelong City Market')
  })

  test('a dropped venue is the one it merged into, so the printed code keeps working', async () => {
    expect((await followVenue(ID, deps({ [ID]: KEPT })))?.id).toBe(KEPT)
  })

  test('a removed venue with no merge, a loop, or a malformed code is nobody', async () => {
    expect(await followVenue(ID, deps({}))).toBeNull()
    expect(await followVenue(ID, deps({ [ID]: ID }))).toBeNull()
    expect(await followVenue('not-an-id', deps({}))).toBeNull()
  })
})

describe('the sheet', () => {
  const A5 = [419.53, 595.28]

  test.each([
    ['a short name', 'The Forum'],
    ['a very long name', 'The Eaglehawk Mechanics Institute and Goldfields Library Community Hall of the Greater Bendigo Region'],
  ])('is one A5 page with %s', async (_, name) => {
    const bytes = await buildVenueQrSheet({ venueName: name, url: venueGoUrl(ID, 'https://www.eventlinqs.com.au'), host: 'eventlinqs.com.au' })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(A5[0], 1)
    expect(height).toBeCloseTo(A5[1], 1)
    expect(doc.getTitle()).toContain(name)
  })
})
