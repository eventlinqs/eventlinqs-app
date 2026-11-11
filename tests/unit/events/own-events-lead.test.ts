import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { byMonth, guideSections, isOwnRow, listingKey, monthOrder, foldListings, JUST_ANNOUNCED_DAYS } from '@/lib/events/guide-sections'
import { ownEventIds, withOwnAndCredits } from '@/lib/events/own-listings'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * THE ORGANISERS' OWN EVENTS LEAD THEIR CITY GUIDE (Lawal, 11 November 2026, 16:26): he could not find Kyivska Perepichka or
 * A Moment of Sanity on /city/melbourne; both sat behind 'Show more'. Every event an organiser submitted or sells on
 * EventLinqs leads: first in Just announced for its first 14 days, then From the organisers, and first in its month, with
 * the organiser's own photo and its credit. A submission we published is written as an ordinary listing, so it is known by
 * listing_submissions (own-listings.ts).
 */
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-11T05:00:00Z')
const at = (dayKey: string, hh = 19) => Date.parse(`${dayKey}T${String(hh).padStart(2, '0')}:00:00Z`)
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'A night', venue: 'Some Hall', city: 'Melbourne', category: 'Music', categorySlug: 'music',
  price: 'From AUD $30', time: '7:00 pm', free: false, source: 'Tickets at Ticketek', format: 'ticketed', cityKey: 'melbourne',
  suburb: null, dayKey: '2026-11-24', dayLabel: 'Tuesday 24 November', ts: at('2026-11-24'), thumb: null, lat: null, lng: null,
  teaser: null, listedAt: null, ...o,
})
const days = { todayKey: '2026-11-11', weekendKeys: ['2026-11-13', '2026-11-14', '2026-11-15'], weekKeys: [] as string[] }

// Ten new engine listings at headline venues (tier 1), all listed yesterday: on their own they fill Just announced's eight.
const engine = Array.from({ length: 10 }, (_, i) =>
  row({ id: `e${i}`, href: `/events/e${i}`, title: `Arena show ${i}`, venue: 'Rod Laver Arena', dayKey: '2026-11-20', ts: at('2026-11-20') + i, listedAt: NOW - DAY }),
)
const sanity = row({ id: 'own1', href: '/events/a-moment-of-sanity', title: 'A Moment of Sanity', venue: 'Malthouse', own: true, dayKey: '2026-11-24', ts: at('2026-11-24'), listedAt: NOW - 4 * DAY, thumb: 'https://x/sanity.jpg', thumbCredit: 'Photo: A Moment of Sanity' })
const kyivska = row({ id: 'own2', href: '/events/kyivska', title: 'Kyivska Perepichka', venue: 'Chapel off Chapel', own: true, dayKey: '2026-12-05', ts: at('2026-12-05'), listedAt: NOW - 4 * DAY, thumb: 'https://x/k.jpg' })
const oldOwn = row({ id: 'own3', href: '/events/old', title: 'An older organiser night', venue: 'Small Room', own: true, dayKey: '2026-12-01', ts: at('2026-12-01'), listedAt: NOW - 30 * DAY })
const sold = row({ id: 'own4', href: '/events/sold', title: 'Sold on EventLinqs', venue: 'The Quakers', source: 'Book on EventLinqs', dayKey: '2026-11-28', ts: at('2026-11-28'), listedAt: NOW - 40 * DAY })
const workshop = row({ id: 'own5', href: '/events/workshop', title: 'Pottery workshop for beginners', venue: 'Studio', own: true, free: true, price: 'Free', source: 'Free · Walk in', format: 'walk_in', categorySlug: 'workshops', dayKey: '2026-11-26', ts: at('2026-11-26'), listedAt: NOW - 2 * DAY })

describe("an organiser's own event", () => {
  it('is one its organiser listed or submitted, or one sold on EventLinqs; an engine listing is not', () => {
    expect(isOwnRow(sanity)).toBe(true)
    expect(isOwnRow(sold)).toBe(true)
    expect(isOwnRow(engine[0])).toBe(false)
  })

  it('leads Just announced in its first 14 days, ahead of every new engine listing, whatever its tier', () => {
    const s = guideSections([...engine, sanity, kyivska, workshop], days, NOW)
    const ids = s.announced.map((e) => e.row.id)
    expect(ids.slice(0, 3).sort()).toEqual(['own1', 'own2', 'own5'])
    expect(ids).toHaveLength(8)
    expect(ids.slice(3).every((id) => id.startsWith('e'))).toBe(true)
  })

  it('past its 14 days it sits in From the organisers, soonest first, and is also first in its month under All events', () => {
    expect(JUST_ANNOUNCED_DAYS).toBe(14)
    const s = guideSections([...engine, oldOwn, sold], days, NOW)
    expect(s.announced.map((e) => e.row.id).some((id) => id.startsWith('own'))).toBe(false)
    expect(s.organisers.map((e) => e.row.id)).toEqual(['own4', 'own3'])
    // Lawal's third place for it: first in its month (own4 in November, own3 in December).
    const rest = s.rest.map((e) => e.row.id)
    expect(rest).toContain('own3')
    expect(rest).toContain('own4')
    const november = s.rest.filter((e) => e.row.dayKey.startsWith('2026-11')).map((e) => e.row.id)
    expect(november[0]).toBe('own4')
  })

  it('an own event over Just announced\'s eight still leads: it goes to From the organisers', () => {
    const many = Array.from({ length: 10 }, (_, i) => row({ id: `o${i}`, href: `/events/o${i}`, title: `Organiser night ${i}`, own: true, ts: at('2026-11-24') + i, listedAt: NOW - DAY }))
    const s = guideSections(many, days, NOW)
    expect(s.announced).toHaveLength(8)
    expect(s.organisers).toHaveLength(2)
    expect([...s.announced, ...s.organisers].map((e) => e.row.id).sort()).toEqual(many.map((r) => r.id).sort())
  })

  it('is shown once in the sections above, and again only as the first in its month; every other listing once on the page', () => {
    const s = guideSections([...engine, sanity, kyivska, oldOwn, sold, workshop], days, NOW)
    const sections = [s.big, s.announced, s.organisers, s.weekend, s.free, s.soon].flat().map((e) => listingKey(e.row))
    expect(new Set(sections).size).toBe(sections.length)
    const twice = s.rest.filter((e) => sections.includes(listingKey(e.row)))
    expect(twice.every((e) => isOwnRow(e.row))).toBe(true)
  })

  it('leads its month in All events, and is never folded away with the month\'s tier 4', () => {
    const library = row({ id: 'lib', href: '/events/lib', title: 'Story time at the library', venue: 'City Library', free: true, price: 'Free', source: 'Free · Walk in', format: 'walk_in', categorySlug: 'family', dayKey: '2026-11-25', ts: at('2026-11-25') })
    const earlier = row({ id: 'early', href: '/events/early', title: 'An early engine night', dayKey: '2026-11-12', ts: at('2026-11-12') })
    const entries = foldListings([earlier, library, workshop, sanity])
    const ordered = monthOrder(entries).map((e) => e.row.id)
    expect(ordered.slice(0, 2).sort()).toEqual(['own1', 'own5'])
    const [november] = byMonth(entries)
    expect(november.entries.slice(0, 2).map((e) => e.row.id).sort()).toEqual(['own1', 'own5'])
    expect(november.later.map((e) => e.row.id)).toEqual(['lib'])
  })
})

describe('known by where it came from, shown with its credit', () => {
  it('a published submission is own by its event or by its series', () => {
    const ids = ownEventIds(
      [{ id: 'ev1', listing_series_id: null }, { id: 'ev2', listing_series_id: 'ser1' }, { id: 'ev3', listing_series_id: 'ser9' }],
      { events: new Set(['ev1']), series: new Set(['ser1']) },
    )
    expect([...ids].sort()).toEqual(['ev1', 'ev2'])
  })

  it('marks the rows and prints the credit line only where a photograph is drawn', () => {
    const rows = [row({ id: 'a', thumb: 'https://x/a.jpg' }), row({ id: 'b' }), row({ id: 'c', thumb: 'https://x/c.jpg' })]
    const out = withOwnAndCredits(rows, new Set(['a', 'b']), new Map([['a', 'Kyivska Perepichka'], ['b', 'no photo'], ['c', 'Some festival']]))
    expect(out.map((r) => [r.id, r.own, r.thumbCredit])).toEqual([
      ['a', true, 'Photo: Kyivska Perepichka'],
      ['b', true, null],
      ['c', false, 'Photo: Some festival'],
    ])
  })

  it('an unchanged row is the same object (no work on the hot path)', () => {
    const r = row({ id: 'z' })
    expect(withOwnAndCredits([r], new Set(), new Map())[0]).toBe(r)
  })
})

describe('the guide draws them (source)', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', 'src', 'components', 'features', 'city-guide', 'city-guide.tsx'), 'utf8').replace(/\r\n/g, '\n')

  it('From the organisers follows Just announced, in the existing rail', () => {
    const just = src.indexOf('<RailHead title="Just announced" />')
    const from = src.indexOf('<RailHead title="From the organisers" />')
    const weekend = src.indexOf('<RailHead title="This weekend"')
    expect(just).toBeGreaterThan(0)
    expect(from).toBeGreaterThan(just)
    expect(weekend).toBeGreaterThan(from)
    // The existing rail; the first section on the page fetches its first photograph first (Lawal, 12 November 2026).
    expect(src.slice(from, from + 120)).toContain('<CardRail entries={sections.organisers}')
  })

  it('every card that draws a photograph prints its credit where one is held', () => {
    // One card photograph rule (cardPhoto): the night's own credit, or the venue named with its licence credit.
    expect(src.match(/photo\?\.credit \? <span/g)?.length).toBe(3)
  })
})
