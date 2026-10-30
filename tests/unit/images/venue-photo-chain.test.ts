import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import { venueCreditLine, withVenuePhotos, type ChainDeps } from '@/lib/images/venue-photo-chain'
import type { VenuePhoto } from '@/lib/venues/venue-photos-read'

/*
 * THE CARD IMAGE CHAIN (the project manager's 16:42 and 16:52 of 30 October 2026, with Lawal): the organiser's approved
 * photo, else an approved photo of THE ACTUAL VENUE, else the typographic cover. Never a photo of another venue. The
 * credit by the 18:57 ruling: no text on a card image; on the card the image's title attribute only, on the event page
 * the line under the photo. One read for a whole page, never one a card (18:00 (2)).
 */

const COMPOSED = 'https://images.eventlinqs.com/event-images/generated-covers/a/1.jpg'
const OWN = 'https://images.eventlinqs.com/event-images/org/cover.jpg'
const VENUE_FILE = 'https://images.eventlinqs.com/event-images/venues/forum.jpg'

const photo = (over: Partial<VenuePhoto> = {}): VenuePhoto => ({
  imageUrl: VENUE_FILE,
  credit: 'Jo Bloggs',
  licence: 'cc_by_sa',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  author: 'Jo Bloggs',
  fileUrl: 'https://commons.wikimedia.org/wiki/File:Forum.jpg',
  ...over,
})

function deps(venues: Record<string, string>, photos: Record<string, VenuePhoto>): ChainDeps & { venueIdsOf: ReturnType<typeof vi.fn>; photosOf: ReturnType<typeof vi.fn> } {
  return {
    venueIdsOf: vi.fn(async () => new Map(Object.entries(venues))),
    photosOf: vi.fn(async () => new Map(Object.entries(photos))),
  }
}

describe('the chain, on a page of rows', () => {
  it("keeps a night's own photograph and never asks for it", async () => {
    const d = deps({}, {})
    const [row] = await withVenuePhotos([{ id: 'e1', cover_image_url: OWN }], { deps: d })
    expect(row.cover_image_url).toBe(OWN)
    expect(d.venueIdsOf).not.toHaveBeenCalled()
  })

  it("gives a night with only our composed cover its venue's approved photo and credit", async () => {
    const [row] = await withVenuePhotos([{ id: 'e1', cover_image_url: COMPOSED }], { deps: deps({ e1: 'v1' }, { v1: photo() }) })
    expect(row.cover_image_url).toBe(VENUE_FILE)
    expect(row.image_credit).toBe('Photo: Jo Bloggs, CC BY-SA 4.0')
    expect(row.image_credit_file).toBe('https://commons.wikimedia.org/wiki/File:Forum.jpg')
    expect(row.image_credit_licence).toBe('https://creativecommons.org/licenses/by-sa/4.0/')
  })

  it('never lends a night another venue\'s photo: no venue, or a venue with none, stays as it was', async () => {
    const rows = [
      { id: 'no-venue', cover_image_url: COMPOSED },
      { id: 'no-photo', cover_image_url: COMPOSED },
    ]
    const out = await withVenuePhotos(rows, { deps: deps({ 'no-photo': 'v2' }, { v1: photo() }) })
    expect(out.map((r) => r.cover_image_url)).toEqual([COMPOSED, COMPOSED])
    expect(out.every((r) => !r.image_credit)).toBe(true)
  })

  it('never removes a night: every row comes back, in its order, whatever its image', async () => {
    const rows = [
      { id: 'own', cover_image_url: OWN },
      { id: 'venue', cover_image_url: COMPOSED },
      { id: 'none', cover_image_url: null },
    ]
    const out = await withVenuePhotos(rows, { deps: deps({ venue: 'v1' }, { v1: photo() }) })
    expect(out.map((r) => r.id)).toEqual(['own', 'venue', 'none'])
  })

  it('makes one read for the whole page, each venue once', async () => {
    const d = deps({ a: 'v1', b: 'v1', c: 'v2' }, { v1: photo() })
    await withVenuePhotos(
      [
        { id: 'a', cover_image_url: COMPOSED },
        { id: 'b', cover_image_url: COMPOSED },
        { id: 'c', cover_image_url: null },
      ],
      { deps: d },
    )
    expect(d.venueIdsOf).toHaveBeenCalledTimes(1)
    expect(d.photosOf).toHaveBeenCalledTimes(1)
    expect(d.photosOf.mock.calls[0][0]).toEqual(['v1', 'v2'])
  })

  it('a failed read takes nothing away: the rows stand and the card falls to its typographic cover', async () => {
    const failing: ChainDeps = { venueIdsOf: async () => new Map([['e1', 'v1']]), photosOf: async () => { throw new Error('function not found') } }
    const rows = [{ id: 'e1', cover_image_url: COMPOSED }]
    expect(await withVenuePhotos(rows, { deps: failing })).toEqual(rows)
  })

  it('asks for the use it is given', async () => {
    const d = deps({ e1: 'v1' }, { v1: photo() })
    await withVenuePhotos([{ id: 'e1', cover_image_url: COMPOSED }], { use: 'event_page', deps: d })
    expect(d.photosOf.mock.calls[0][1]).toBe('event_page')
  })
})

describe('the credit, by licence', () => {
  it('names the author and the licence where the licence asks', () => {
    expect(venueCreditLine(photo())).toBe('Photo: Jo Bloggs, CC BY-SA 4.0')
    expect(venueCreditLine(photo({ licence: 'cc_by', licenceUrl: 'https://creativecommons.org/licenses/by/2.0/' }))).toBe('Photo: Jo Bloggs, CC BY 2.0')
  })
  it('never states a version the link does not', () => {
    expect(venueCreditLine(photo({ licenceUrl: 'https://example.org/licence' }))).toBe('Photo: Jo Bloggs, CC BY-SA')
  })
  it('shows none for CC0 and public domain, which ask for none', () => {
    expect(venueCreditLine(photo({ licence: 'cc0' }))).toBeNull()
    expect(venueCreditLine(photo({ licence: 'public_domain' }))).toBeNull()
  })
  it("gives a venue's own photograph the credit it was sent with", () => {
    expect(venueCreditLine(photo({ licence: 'owner_permission', credit: 'The Forum', author: null }))).toBe('Photo: The Forum')
  })
})

describe('on the card', () => {
  it('draws the photograph with the credit in its title attribute and no text on it', () => {
    const html = renderToStaticMarkup(
      createElement(EventCardMedia, { src: VENUE_FILE, alt: 'A night', variant: 'grid-one-two-three', title: 'Photo: Jo Bloggs, CC BY-SA 4.0' }),
    )
    expect(html).toContain('<img')
    expect(html).toContain('title="Photo: Jo Bloggs, CC BY-SA 4.0"')
    expect(html.replace(/<[^>]+>/g, '').trim()).toBe('')
  })
})
