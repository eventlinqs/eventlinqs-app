import { describe, expect, it } from 'vitest'
import { foldListings, guideSections, inRange, isBigNight, listingKey } from '@/lib/events/guide-sections'
import { directoryDays, type DirectoryInput, type DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * ROUND 5 (the CONTROLLER's order of 3 November 2026, 09:20, C:\dev\GROWTH\ROUND5-STABILITY-ORDER-3NOV.md, and law 17 (d)):
 *   fault 2: AMCF, a free walk in festival its organiser listed with us, belongs at the top of Melbourne's Big nights;
 *   fault 3: Boyz II Men (Mt Duneed Estate, 28 November) is not in Geelong's Big nights and stays out (Lawal 12:29, the
 *     CONTROLLER's 12:31: Big nights is photo first then date; a show with no permitted photograph is not forced in), but
 *     it is reachable on the guide;
 *   law 16: every published upcoming night is reachable on its guide under All dates;
 *   the 11:42 sentinel: a night leaves the guide AT its end, so every row carries its end.
 */
const at = (dayKey: string, hh = 19) => Date.parse(`${dayKey}T${String(hh).padStart(2, '0')}:00:00Z`)
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'Open Mic Comedy', venue: 'The Barwon Club', city: 'Geelong', category: 'Comedy',
  categorySlug: 'comedy', price: 'Free entry', time: '7:00 pm', free: true, source: 'Free · Walk in', format: 'walk_in',
  cityKey: 'geelong', suburb: 'South Geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November', ts: at('2026-11-03'),
  thumb: null, lat: null, lng: null, teaser: null, listedAt: null, ...o,
})
const paid = (o: Partial<DirectoryRow>) => row({ free: false, format: 'ticketed', price: 'From AUD $59', source: 'Get tickets', ...o })
const days = { todayKey: '2026-11-03', weekendKeys: ['2026-11-06', '2026-11-07', '2026-11-08'], weekKeys: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'] }
const NOW = Date.parse('2026-11-03T01:00:00Z')

// Geelong as live read it at 12:09 on 3 November: Big night candidates with no photograph, the soonest three first.
const anhDo = paid({ id: 'a', title: 'Anh Do: The Happiest Refugee Live!', venue: 'The Play House', dayKey: '2026-11-03', ts: at('2026-11-03') })
const macbeth = paid({ id: 'm', title: 'Macbeth', venue: 'Geelong Arts Centre', dayKey: '2026-11-06', ts: at('2026-11-06') })
const eagles = paid({ id: 'e', title: 'The Eagles Greatest Hits', venue: 'The Play House', dayKey: '2026-11-12', ts: at('2026-11-12') })
const sweet = paid({ id: 's', title: 'The Sweet (UK): The Final Blitz Tour', venue: 'Costa Hall', dayKey: '2026-11-13', ts: at('2026-11-13') })
const boyz = paid({ id: 'b', title: 'Boyz II Men', venue: 'Mt Duneed Estate', dayKey: '2026-11-28', ts: at('2026-11-28', 5) })
const amcf = row({
  id: 'amcf', title: 'African Music and Cultural Festival 2026', venue: 'Fed Square', city: 'Melbourne', cityKey: 'melbourne',
  categorySlug: 'festival', category: 'Festival', source: 'Free · Walk in', format: 'walk_in', free: true, own: true,
  thumb: '/organiser-supplied/amcf-2026/amcf-2024-0980-whole.jpg', dayKey: '2026-11-20', ts: at('2026-11-20', 0),
})

describe('round 5 fault 2: an organiser listed festival is a Big night however it is entered', () => {
  it('AMCF (free, walk in, its organiser listed it) is a Big night; a festival listed by nobody of its own is not', () => {
    expect(isBigNight(amcf)).toBe(true)
    expect(isBigNight({ ...amcf, own: false })).toBe(false)
  })
  it('AMCF, with its own photograph, leads Melbourne Big nights', () => {
    const forum = paid({ id: 'f', title: 'The Rubens', venue: 'Forum Melbourne', city: 'Melbourne', cityKey: 'melbourne', dayKey: '2026-11-05', ts: at('2026-11-05') })
    const s = guideSections([forum, amcf], days, NOW)
    expect(s.big[0].row.id).toBe('amcf')
  })
})

describe("Lawal 12:29, made law 18 on 4 November 15:12: a show with no photograph is never in Big nights", () => {
  it("Geelong's shows without a photograph are not in Big nights (none, the section hides), and Boyz II Men is still reachable with All dates", () => {
    const rows = [anhDo, macbeth, eagles, sweet, boyz]
    const s = guideSections(rows, days, NOW)
    expect(s.big.map((e) => e.row.title)).toEqual([])
    const allDates = foldListings(rows.filter((r) => inRange(r, 'all', days)), rows).map((e) => e.row.title)
    expect(allDates).toContain('Boyz II Men')
  })
  it('a permitted photograph puts a show first', () => {
    const s = guideSections([anhDo, macbeth, eagles, { ...boyz, thumb: '/own-photo.jpg' }], days, NOW)
    expect(s.big[0].row.title).toBe('Boyz II Men')
  })
})

describe('law 16: every listed night is reachable on its guide under All dates', () => {
  it('the sections and the All dates list together hold every listing, whatever the caps', () => {
    const many: DirectoryRow[] = []
    for (let i = 0; i < 140; i++) {
      const d = `2026-${String(11 + Math.floor(i / 28)).padStart(2, '0')}-${String(3 + (i % 28)).padStart(2, '0')}`
      const k = d > '2026-12-31' ? d.replace('2026-13', '2027-01') : d
      many.push(paid({ id: `n${i}`, title: `Night ${i}`, venue: i % 3 ? 'The Play House' : 'Costa Hall', dayKey: k, ts: Date.parse(`${k}T09:00:00Z`) }))
    }
    many.push(boyz, amcf)
    const s = guideSections(many, days, NOW)
    const inSections = new Set([...s.big, ...s.announced, ...s.weekend, ...s.free, ...s.soon].map((e) => listingKey(e.row)))
    const allDates = foldListings(many.filter((r) => inRange(r, 'all', days)), many).map((e) => listingKey(e.row))
    const reachable = new Set([...inSections, ...allDates])
    for (const r of many) expect(reachable.has(listingKey(r)), `${r.title} is reachable`).toBe(true)
  })
})

describe('the 11:42 sentinel: every row carries its end, so the guide can drop a night AT its end', () => {
  const input = (o: Partial<DirectoryInput>): DirectoryInput => ({
    id: 'x', slug: 'preschool-story-time-chilwell-library-2026-11-03', title: 'Preschool Story Time', start_date: '2026-11-02T23:30:00Z',
    timezone: 'Australia/Melbourne', venue_name: 'Chilwell Library', venue_city: 'Geelong', category: null, ticket_tiers: [], ...o,
  })
  it('until is the night end where one is held, else the end of its day in its own zone', () => {
    const [d] = directoryDays([input({ end_date: '2026-11-03T00:20:00Z' })], new Date(NOW))
    expect(d.rows[0].until).toBe(Date.parse('2026-11-03T00:20:00Z'))
    const [e] = directoryDays([input({ end_date: null })], new Date(NOW))
    expect(e.rows[0].until).toBe(Date.parse('2026-11-03T13:00:00Z')) // listingUntil's end of day: midnight in its zone
  })
  it("its own organiser's listing is marked, and a thumb carries the cover's alt", () => {
    const [d] = directoryDays(
      [input({ listing_source: 'organiser', cover_image_alt: 'A big crowd at the festival in Fed Square' })],
      new Date(NOW),
      new Map([['x', '/p.jpg']]),
    )
    expect(d.rows[0].own).toBe(true)
    expect(d.rows[0].thumbAlt).toBe('A big crowd at the festival in Fed Square')
    const [n] = directoryDays([input({ listing_source: 'eventlinqs', cover_image_alt: 'words' })], new Date(NOW))
    expect(n.rows[0].own).toBe(false)
    expect(n.rows[0].thumbAlt).toBeNull()
  })
})
