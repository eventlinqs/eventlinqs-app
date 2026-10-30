import { describe, expect, it } from 'vitest'
import { arrivalsLine, buildVenueReport, nightsAVenueSees, venueArrivals, type VenueNightRow } from '@/lib/venues/venue-report-math'
import { FIGURES_VERSION } from '@/lib/growth/organiser-report-math'

/*
 * THE VENUE'S OWN REPORT (the DemandOS directive, section 3, 'venue-level performance reporting'; the PROJECT
 * MANAGER's 17:25: 'the venue partnership report shows the four honest levels ... and never more'). A venue hosts other
 * organisers' nights: their order counts are their commercial numbers, and a venue sees them only by never seeing them.
 */
const figures = (o: { viewers?: number; people?: number; orders?: number | null; tickets?: number; goPresses?: number[] } = {}) => ({
  version: FIGURES_VERSION,
  viewers: o.viewers ?? 0,
  pressesOut: { people: o.people ?? 0 },
  onEventLinqs: o.orders === undefined || o.orders === null ? null : { orders: o.orders, tickets: o.tickets ?? 0 },
  instagramReach: null,
  posts: (o.goPresses ?? []).map((goPresses) => ({ goPresses })),
})

const night = (id: string, own: boolean, f: unknown): VenueNightRow => ({
  eventId: id,
  title: `Night ${id}`,
  startDate: '2026-10-01T09:00:00Z',
  timezone: 'Australia/Melbourne',
  own,
  figures: f,
})

describe('which nights a venue sees', () => {
  const rows = [
    { id: 'own', organisation_id: 'venue-org' },
    { id: 'joined', organisation_id: 'other-org' },
    { id: 'stranger', organisation_id: 'other-org' },
  ]

  it("takes its own organisation's nights and the nights it joined, never another organiser's it did not join", () => {
    const seen = nightsAVenueSees(rows, 'venue-org', new Set(['joined']))
    expect(seen.map((n) => [n.id, n.own])).toEqual([['own', true], ['joined', false]])
  })

  it('a joined row for a night no longer at this venue adds nothing', () => {
    expect(nightsAVenueSees(rows, 'venue-org', new Set(['gone'])).map((n) => n.id)).toEqual(['own'])
  })
})

describe('the venue report', () => {
  it('adds the counted levels across its nights', () => {
    const r = buildVenueReport([night('a', true, figures({ viewers: 10, people: 3, orders: 2, tickets: 5, goPresses: [4] })), night('b', true, figures({ viewers: 7, people: 1, orders: 1, tickets: 1 }))])
    expect(r.levels.nights).toBe(2)
    expect(r.levels.interest.people).toBe(17)
    expect(r.levels.bookingIntent.people).toBe(4)
    expect(r.levels.exposure.goTaps).toBe(4)
    expect(r.levels.verifiedSale.orders).toBe(3)
    expect(r.levels.verifiedSale.tickets).toBe(6)
  })

  it("NEVER shows another organiser's orders, even on a night the venue joined", () => {
    const r = buildVenueReport([night('own', true, figures({ orders: 2, tickets: 2 })), night('joined', false, figures({ viewers: 50, people: 9, orders: 40, tickets: 90 }))])
    expect(r.levels.verifiedSale.orders).toBe(2)
    expect(r.levels.verifiedSale.tickets).toBe(2)
    expect(r.levels.interest.people).toBe(50)
    expect(r.levels.bookingIntent.people).toBe(9)
    expect(JSON.stringify(r)).not.toContain('"orders":40')
    expect(r.lines.join(' ')).not.toMatch(/\b40\b|\b90\b/)
    expect(r.nights.find((n) => n.eventId === 'joined')?.verifiedSale).toEqual({ orders: null, tickets: null })
  })

  it("does not call a joined night 'not ticketed'; that would be a fact we do not state", () => {
    const r = buildVenueReport([night('joined', false, figures({ orders: 40, tickets: 90 }))])
    expect(r.levels.verifiedSale.nightsNotVisible).toBe(0)
    expect(r.joinedNights).toBe(1)
    expect(r.lines[3]).not.toMatch(/not ticketed/)
    expect(r.lines[3]).toMatch(/1 night run by another organiser, whose sales are theirs/)
  })

  it('says an outside night of its own is not visible to us, never zero', () => {
    const r = buildVenueReport([night('a', true, figures({ viewers: 3, orders: null }))])
    expect(r.levels.verifiedSale.orders).toBeNull()
    expect(r.lines[3]).toMatch(/not visible to us/)
  })

  it('a kept report of another version is counted as unread, never read as zeros', () => {
    const r = buildVenueReport([night('old', true, { version: FIGURES_VERSION + 1, viewers: 99 }), night('a', true, figures({ viewers: 5 }))])
    expect(r.unread).toBe(1)
    expect(r.levels.nights).toBe(1)
    expect(r.levels.interest.people).toBe(5)
    expect(r.nights.map((n) => n.eventId)).toEqual(['a'])
  })

  it('exactly four lines, booking intent never called a sale', () => {
    const r = buildVenueReport([night('a', true, figures({ people: 2 }))])
    expect(r.lines).toHaveLength(4)
    expect(r.lines[2]).toMatch(/never counted as a sale/)
  })

  it('no night reported is an empty report, not four zeros', () => {
    const r = buildVenueReport([])
    expect(r.empty).toBe(true)
    expect(r.lines).toEqual([])
  })
})

describe("arrivals by the venue's own code (/go/v, car 17)", () => {
  it('counts each press once, by how it came, and never a QA press', () => {
    const a = venueArrivals([
      { via: 'qr', is_test: false },
      { via: 'qr', is_test: false },
      { via: 'link', is_test: false },
      { via: 'qr', is_test: true },
    ])
    expect(a).toEqual({ total: 3, qr: 2, link: 1 })
    expect(arrivalsLine(a)).toBe('Arrivals by your own code: 3 (2 by the printed QR code, 1 by the link). One per person per day; an arrival is not a booking.')
  })

  it('says plainly when no one has come by it yet, never a row of zeros', () => {
    expect(arrivalsLine(venueArrivals([]))).toBe('No one has arrived by your own code yet.')
    expect(arrivalsLine(venueArrivals([{ via: 'link', is_test: true }]))).toBe('No one has arrived by your own code yet.')
  })

  it('a code that was not read is said so, never shown as none', () => {
    expect(arrivalsLine(null)).toBe('Arrivals by your own code could not be read just now.')
  })
})
