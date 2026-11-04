import { describe, expect, it } from 'vitest'
import { tierOf } from '@/lib/events/relevance'
import { byMonth, guideSections, isBigNight, LATER_FOLD, monthOrder, foldListings, type GuideDays } from '@/lib/events/guide-sections'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * LAW 18, RELEVANCE ORDER, ITS GUARD (Lawal, 4 November 2026, 15:12 and 15:25; the CONTROLLER's 15:20 and 15:40;
 * C:\dev\GROWTH\RELEVANCE-ORDER-4NOV.md). Big nights only with a permitted photograph; tiers 1 to 4 from the listing's
 * own fields; tier 4 never in Big nights, Just announced or This weekend; the month list in date order with tier 4 at
 * the end of each month under one fold; law 16 holds, nothing is dropped.
 */
describe('the tier, from the listing\'s own fields (a test per tier)', () => {
  it('tier 1: ticketed at a headline venue, or a ticketed festival', () => {
    expect(tierOf({ title: 'Boyz II Men', venue: 'Mt Duneed Estate', categorySlug: 'music', ticketed: true })).toBe(1)
    expect(tierOf({ title: 'An Arena Show', venue: 'Rod Laver Arena', categorySlug: 'music', ticketed: true })).toBe(1)
    expect(tierOf({ title: 'Macbeth', venue: 'Costa Hall', categorySlug: 'theatre', ticketed: true })).toBe(1)
    expect(tierOf({ title: 'Geelong Beer Festival', venue: 'Johnstone Park', categorySlug: 'festival', ticketed: true })).toBe(1)
  })
  it('tier 2: any other ticketed night, and a free festival or community festival (AMCF)', () => {
    expect(tierOf({ title: 'Wax Quizzical', venue: 'Comedy Republic', categorySlug: 'comedy', ticketed: true })).toBe(2)
    expect(tierOf({ title: 'Live at the Barwon Club', venue: 'Barwon Club Hotel', categorySlug: 'music', ticketed: true })).toBe(2)
    expect(tierOf({ title: 'AMCF 2026', venue: 'Federation Square', categorySlug: 'festival', ticketed: false })).toBe(2)
  })
  it('tier 3: markets, community events and every other free night', () => {
    expect(tierOf({ title: 'Farmers Market', venue: 'Steampacket Gardens', categorySlug: 'markets', ticketed: false })).toBe(3)
    expect(tierOf({ title: 'Community Picnic', venue: 'Eastern Park', categorySlug: 'community', ticketed: false })).toBe(3)
  })
  it('tier 4 LAST: library sessions, story time, toddler and baby sessions, meetups, classes, workshops, support groups', () => {
    expect(tierOf({ title: 'Baby Time', venue: 'Geelong West Library', categorySlug: 'family', ticketed: false })).toBe(4)
    expect(tierOf({ title: 'Preschool Story Time', venue: 'Corio Library', categorySlug: 'family', ticketed: false })).toBe(4)
    expect(tierOf({ title: 'Toddler Time', venue: 'Town Hall', categorySlug: 'family', ticketed: false })).toBe(4)
    expect(tierOf({ title: 'Writers Meetup', venue: 'The Hall', categorySlug: 'community', ticketed: false })).toBe(4)
    expect(tierOf({ title: 'Pottery Workshop', venue: 'Studio 3', categorySlug: 'arts-community', ticketed: true })).toBe(4)
    expect(tierOf({ title: 'Carers Support Group', venue: 'Hub', categorySlug: 'community', ticketed: false })).toBe(4)
    expect(tierOf({ title: 'Life Drawing', venue: 'Art Space', categorySlug: 'classes-workshops', ticketed: false })).toBe(4)
  })
})

const DAY = 86400000
const T0 = Date.parse('2026-11-05T09:00:00Z')
let n = 0
const row = (o: Partial<DirectoryRow>): DirectoryRow =>
  ({
    id: `r${(n += 1)}`, href: `/events/r${n}`, title: `Night ${n}`, venue: 'A Room', city: 'Geelong', category: null, categorySlug: 'music', price: '$30',
    time: '7:30 pm', free: false, source: 'Tickets at Somewhere', format: 'ticketed', cityKey: 'geelong', dayKey: '2026-11-05', dayLabel: '', ts: T0, thumb: null,
    suburb: null, lat: null, lng: null, listedAt: null, ...o,
  }) as DirectoryRow
const days: GuideDays = { todayKey: '2026-11-05', weekendKeys: ['2026-11-07', '2026-11-08'], weekKeys: [] }

describe('the sections and the month list keep law 18', () => {
  it('Big nights only with a permitted photograph, whatever the size; a city with none shows none', () => {
    const big = row({ title: 'Boyz II Men', venue: 'Mt Duneed Estate' })
    expect(isBigNight(big)).toBe(false)
    expect(isBigNight({ ...big, thumb: 'https://x/photo.jpg' })).toBe(true)
    expect(guideSections([big], days, T0).big).toHaveLength(0)
  })

  it('tier 4 is never in Big nights, Just announced or This weekend; This weekend ranks tier then date', () => {
    const baby = row({ title: 'Baby Time', venue: 'Geelong West Library', free: true, format: 'walk_in', dayKey: '2026-11-07', ts: T0 + 2 * DAY, listedAt: T0, thumb: 'https://x/b.jpg', categorySlug: 'festival' })
    const pub = row({ title: 'Pub Gig', venue: 'Barwon Club', dayKey: '2026-11-07', ts: T0 + 2 * DAY + 3600000 })
    const arena = row({ title: 'Arena Show', venue: 'GMHBA Stadium', dayKey: '2026-11-08', ts: T0 + 3 * DAY })
    const s = guideSections([baby, pub, arena], days, T0)
    expect(s.big.map((e) => e.row.title)).toEqual([])
    expect(s.announced.map((e) => e.row.title)).not.toContain('Baby Time')
    expect(s.weekend.map((e) => e.row.title)).toEqual(['Arena Show', 'Pub Gig'])
    expect(s.free.map((e) => e.row.title)).toEqual(['Baby Time'])
  })

  it('the month list stays in date order with tier 4 at the end of each month, under one fold, nothing dropped', () => {
    const storyEarly = row({ title: 'Story Time', venue: 'Corio Library', free: true, format: 'walk_in', dayKey: '2026-11-06', ts: T0 + DAY })
    const gigLate = row({ title: 'Late Gig', dayKey: '2026-11-20', ts: T0 + 15 * DAY })
    const gigEarly = row({ title: 'Early Gig', dayKey: '2026-11-10', ts: T0 + 5 * DAY })
    const decGig = row({ title: 'December Gig', dayKey: '2026-12-02', ts: T0 + 27 * DAY })
    const ordered = monthOrder(foldListings([storyEarly, gigLate, gigEarly, decGig]))
    expect(ordered.map((e) => e.row.title)).toEqual(['Early Gig', 'Late Gig', 'Story Time', 'December Gig'])
    const months = byMonth(ordered)
    expect(months.map((m) => [m.key, m.entries.map((e) => e.row.title), m.later.map((e) => e.row.title)])).toEqual([
      ['2026-11', ['Early Gig', 'Late Gig'], ['Story Time']],
      ['2026-12', ['December Gig'], []],
    ])
    expect(LATER_FOLD).toBe('Also this month: family, library and community sessions')
  })
})
