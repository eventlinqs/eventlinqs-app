import { describe, expect, it } from 'vitest'
import {
  addDaysKey, addMonthsKey, byMonth, foldListings, guideSections, inRange, isBigNight, listingKey, whenLine,
} from '@/lib/events/guide-sections'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'

/*
 * ROUND 3, LOCKED (Lawal, 2 November 2026, 17:00 to 17:10; C:\dev\DESIGN\CITY-FIRST-1NOV\ROUND3-LOCKED\
 * ROUND3-DIRECTIVE-2NOV.md, items 1 to 6): the sections are chosen by stated rules, photo first then date, no listing
 * twice on one page, recurring folded, the browse list on the next 3 months by default, and nothing hidden by distance.
 */
const at = (dayKey: string, hh = 19) => Date.parse(`${dayKey}T${String(hh).padStart(2, '0')}:00:00Z`)
const row = (o: Partial<DirectoryRow>): DirectoryRow => ({
  id: 'r1', href: '/events/r1', title: 'Open Mic Comedy', venue: 'The Barwon Club', city: 'Geelong', category: 'Comedy',
  categorySlug: 'comedy', price: 'Free entry', time: '7:00 pm', free: true, source: 'Free · Walk in', format: 'walk_in',
  cityKey: 'geelong', suburb: 'South Geelong', dayKey: '2026-11-03', dayLabel: 'Tuesday 3 November', ts: at('2026-11-03'),
  thumb: null, lat: null, lng: null, teaser: null, listedAt: null, ...o,
})
const days = { todayKey: '2026-11-02', weekendKeys: ['2026-11-06', '2026-11-07', '2026-11-08'], weekKeys: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'] }
const NOW = Date.parse('2026-11-02T09:00:00Z')
const paid = (o: Partial<DirectoryRow>) => row({ free: false, format: 'ticketed', price: 'From AUD $59', source: 'Tickets at Geelong Arts Centre', ...o })

describe('the calendar arithmetic', () => {
  it('adds days and months on wall days, clamping a month end', () => {
    expect(addDaysKey('2026-11-30', 1)).toBe('2026-12-01')
    expect(addMonthsKey('2026-11-02', 3)).toBe('2027-02-02')
    expect(addMonthsKey('2026-11-30', 3)).toBe('2027-02-28')
  })
  it("'three' is today to three months on; 'all' hides nothing", () => {
    expect(inRange(row({ dayKey: '2027-02-02' }), 'three', days)).toBe(true)
    expect(inRange(row({ dayKey: '2027-02-03' }), 'three', days)).toBe(false)
    expect(inRange(row({ dayKey: '2027-09-01' }), 'all', days)).toBe(true)
    expect(inRange(row({ dayKey: '2026-12-03' }), 'month', days)).toBe(true)
    expect(inRange(row({ dayKey: '2026-12-04' }), 'month', days)).toBe(false)
  })
})

describe('Big nights, the stated rule (item 1)', () => {
  // Law 18 (Lawal, 4 November 2026, 15:12): a permitted photograph is required too, whatever the size.
  it('a paid ticketed night at a named big venue, or a festival its organiser listed with us, WITH its photograph; never a free night', () => {
    const photo = '/p/own.jpg'
    expect(isBigNight(paid({ venue: 'Costa Hall, Geelong Arts Centre', thumb: photo }))).toBe(true)
    expect(isBigNight(paid({ venue: 'Mt Duneed Estate', thumb: photo }))).toBe(true)
    expect(isBigNight(paid({ venue: 'Mt Duneed Estate' }))).toBe(false)
    expect(isBigNight(paid({ venue: 'The Barwon Club', thumb: photo }))).toBe(false)
    expect(isBigNight(row({ venue: 'Costa Hall', thumb: photo }))).toBe(false)
    expect(isBigNight(row({ categorySlug: 'festival', source: 'Register on EventLinqs', venue: 'Federation Square', thumb: photo }))).toBe(true)
  })
})

describe('the sections (items 1 to 4)', () => {
  const rows = [
    paid({ id: 'b1', title: 'Hindley Street Country Club', venue: 'Costa Hall', dayKey: '2026-11-14', ts: at('2026-11-14') }),
    paid({ id: 'b2', title: 'Boyz II Men', venue: 'Mt Duneed Estate', dayKey: '2026-11-28', ts: at('2026-11-28'), thumb: '/p/boyz.jpg' }),
    row({ id: 'w1', title: 'Katie Noonan', dayKey: '2026-11-06', ts: at('2026-11-06') }),
    row({ id: 'm1', title: 'Geelong City Market', venue: 'Little Malop Street', dayKey: '2026-11-07', ts: at('2026-11-07', 9) }),
    row({ id: 'm2', title: 'Geelong City Market', venue: 'Little Malop Street', dayKey: '2026-11-14', ts: at('2026-11-14', 9) }),
    row({ id: 'm3', title: 'Geelong City Market', venue: 'Little Malop Street', dayKey: '2026-11-21', ts: at('2026-11-21', 9) }),
    row({ id: 's1', title: 'Ben Folds', venue: 'The Barwon Club', free: false, dayKey: '2027-03-27', ts: at('2027-03-27') }),
    row({ id: 'n1', title: 'Story time', venue: 'Geelong Library', dayKey: '2026-12-10', ts: at('2026-12-10'), listedAt: NOW - 3 * 86_400_000 }),
  ]
  const s = guideSections(rows, days, NOW)
  // Law 18 superseded 'photo first': no photograph, no Big nights (Hindley Street Country Club has none).
  it('Big nights: only with a photograph, then by headline weight and date', () => {
    expect(s.big.map((e) => e.row.id)).toEqual(['b2'])
  })
  it('no listing appears twice on one page, the list included', () => {
    const all = [s.big, s.announced, s.weekend, s.free, s.soon, s.rest].flat().map((e) => listingKey(e.row))
    expect(new Set(all).size).toBe(all.length)
    // Law 18: story time at a library is tier 4, never Just announced; it stays in the month list.
    expect(s.announced.map((e) => e.row.id)).toEqual([])
    expect(s.weekend.map((e) => e.row.id)).toEqual(['w1', 'm1'])
  })
  it('Coming soon reads past the three months: nothing is hidden by distance', () => {
    expect(s.soon.map((e) => e.row.id)).toEqual(['s1'])
  })
  it("a weekly listing is ONE entry, 'Every Saturday', with its later nights counted", () => {
    const [market] = foldListings(rows.filter((r) => r.id.startsWith('m')))
    expect(market.row.id).toBe('m1')
    expect(market.more).toBe(2)
    expect(market.every).toBe('Every Saturday')
    expect(whenLine(market)).toBe('Every Saturday · 7:00 pm')
    expect(whenLine({ row: rows[2], more: 0, every: null })).toBe('Fri 6 Nov · 7:00 pm')
  })
  it('the browse list groups by month', () => {
    const months = byMonth(foldListings(rows))
    expect(months.map((m) => m.label)).toEqual(['November 2026', 'December 2026', 'March 2027'])
  })
})
