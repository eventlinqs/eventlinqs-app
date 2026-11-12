import { describe, expect, it } from 'vitest'
import { guideSections, isBigNight, leadWithPhoto, sectionOrder, type Entry } from '@/lib/events/guide-sections'
import { applyVenueThumbs } from '@/lib/events/venue-thumbs'
import { cardPhoto } from '@/components/features/city-guide/city-guide'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'
import type { VenuePhoto } from '@/lib/venues/venue-photos-read'

/*
 * THE CITY GUIDE BECOMES PHOTO-LED (Lawal, 12 November 2026, 01:01, through the PM): each section opens with a real
 * photograph (the organiser's own first, then the venue's own the photo lock dealt to that night), venue photographs on
 * cards labelled as the venue with their credit, and the photo-led sections first; every section and every event kept.
 */
const at = (dayKey: string, hh = 19) => Date.parse(`${dayKey}T${String(hh).padStart(2, '0')}:00:00Z`)
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'Open Mic Comedy', venue: 'The Barwon Club', city: 'Geelong', category: 'Comedy',
  categorySlug: 'comedy', price: 'Free entry', time: '7:00 pm', free: true, source: 'Free · Walk in', format: 'walk_in',
  cityKey: 'geelong', suburb: 'South Geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November', ts: at('2026-11-03'),
  thumb: null, lat: null, lng: null, teaser: null, listedAt: null, ...o,
})
const entry = (o: Partial<DirectoryRow>): Entry => ({ row: row(o), more: 0, every: null })
const days = {
  todayKey: '2026-11-02',
  weekendKeys: ['2026-11-06', '2026-11-07', '2026-11-08'],
  weekKeys: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
}
const NOW = Date.parse('2026-11-02T09:00:00Z')
const photo = (o: Partial<VenuePhoto> = {}): VenuePhoto => ({
  imageUrl: 'https://upload.wikimedia.org/fed-square.jpg', credit: 'Fed Square at night', licence: 'cc_by_sa',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'A. Photographer', fileUrl: 'https://commons.wikimedia.org/wiki/File:Fed.jpg',
  ...o,
} as VenuePhoto)

describe('a section opens with a real photograph (item 1)', () => {
  it("the night's own photograph leads, then the venue's, and only that one entry moves", () => {
    const a = entry({ id: 'a' })
    const b = entry({ id: 'b', venueThumb: 'https://v/b.jpg' })
    const c = entry({ id: 'c', thumb: 'https://o/c.jpg' })
    const d = entry({ id: 'd' })
    expect(leadWithPhoto([a, b, c, d]).map((e) => e.row.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(leadWithPhoto([a, b, d]).map((e) => e.row.id)).toEqual(['b', 'a', 'd'])
  })
  it('a section with no permitted photograph is left exactly as it was, never a stand-in', () => {
    const list = [entry({ id: 'a' }), entry({ id: 'b' })]
    expect(leadWithPhoto(list).map((e) => e.row.id)).toEqual(['a', 'b'])
    expect(leadWithPhoto([])).toEqual([])
  })
  it("a section's pick is unchanged: the photo entry is hoisted before the cap, the displaced one goes to the month list", () => {
    const rows = [
      row({ id: 'w1', title: 'Night one', dayKey: '2026-11-06', ts: at('2026-11-06') }),
      row({ id: 'w2', title: 'Night two', dayKey: '2026-11-07', ts: at('2026-11-07'), venueThumb: 'https://v/w2.jpg' }),
    ]
    const s = guideSections(rows, days, NOW)
    expect(s.weekend[0].row.id).toBe('w2')
    const everywhere = [...s.big, ...s.announced, ...s.organisers, ...s.weekend, ...s.free, ...s.soon, ...s.rest].map((e) => e.row.id)
    expect(new Set(everywhere)).toEqual(new Set(['w1', 'w2']))
  })
})

describe('the photo-led sections first, the text-heavy ones below (item 3)', () => {
  it('orders, never removes: every non-empty section stays, empty ones stay hidden', () => {
    const lit = [entry({ id: 'p', thumb: 'https://o/p.jpg' })]
    const plain = [entry({ id: 'q' })]
    const order = sectionOrder({ big: [], announced: plain, organisers: plain, weekend: lit, free: lit, soon: [] })
    expect(order).toEqual(['weekend', 'free', 'announced', 'organisers'])
  })
  it('with no photograph anywhere, the base order holds (round 3, Lawal 16:26)', () => {
    const plain = [entry({ id: 'q' })]
    expect(sectionOrder({ big: [], announced: plain, organisers: plain, weekend: plain, free: plain, soon: plain })).toEqual([
      'announced', 'organisers', 'weekend', 'free', 'soon',
    ])
  })
})

describe('the venue photograph on a card, labelled as the venue (item 2)', () => {
  it("applies the photo lock's dealt photograph only to a night with none of its own", () => {
    const rows = [row({ id: 'own', thumb: 'https://o/own.jpg' }), row({ id: 'bare' }), row({ id: 'none' })]
    const covers = new Map([['own', photo()], ['bare', photo()]])
    const out = applyVenueThumbs(rows, covers)
    expect(out[0].venueThumb).toBeUndefined()
    expect(out[1].venueThumb).toBe('https://upload.wikimedia.org/fed-square.jpg')
    expect(out[1].venueThumbCredit).toBe('Photo: A. Photographer, CC BY-SA 4.0')
    expect(out[2].venueThumb).toBeUndefined()
  })
  it('the card names the venue beside the licence credit, so the venue is never presented as the act', () => {
    const p = cardPhoto(row({ venue: 'Federation Square', venueThumb: 'https://v/f.jpg', venueThumbCredit: 'Photo: A. Photographer, CC BY-SA 4.0' }))
    expect(p).toEqual({
      src: 'https://v/f.jpg',
      alt: 'Federation Square, the venue',
      credit: 'The venue, Federation Square. Photo: A. Photographer, CC BY-SA 4.0',
    })
  })
  it("the night's own photograph wins, with its own credit; no photograph at all draws none", () => {
    expect(cardPhoto(row({ thumb: 'https://o/x.jpg', thumbAlt: 'The band on stage', thumbCredit: 'Photo: the organiser', venueThumb: 'https://v/f.jpg' }))).toEqual({
      src: 'https://o/x.jpg', alt: 'The band on stage', credit: 'Photo: the organiser',
    })
    expect(cardPhoto(row({}))).toBeNull()
  })
  it('a venue photograph never puts a night in Big nights: law 18 asks for the night\'s own', () => {
    const big = row({ venue: 'GMHBA Stadium', free: false, format: 'ticketed', price: 'From AUD $99', source: 'Tickets at Ticketek', categorySlug: 'music' })
    expect(isBigNight({ ...big, venueThumb: 'https://v/s.jpg' })).toBe(false)
    expect(isBigNight({ ...big, thumb: 'https://o/s.jpg' })).toBe(true)
  })
})
