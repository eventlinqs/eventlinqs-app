import { describe, expect, it } from 'vitest'
import { directoryDays, rowPrice, sourceLabel, suburbOf, type DirectoryInput } from '@/lib/events/whats-on-directory'
import { discoveryDays, windowDayKeys } from '@/lib/events/discovery-data'
import { featuredWithRecordedRights } from '@/lib/events/featured-with-recorded-rights'

const base: DirectoryInput = {
  id: 'x',
  slug: 'x',
  title: 'X',
  start_date: '2026-11-01T09:00:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'A Hall',
  venue_city: 'Ballarat',
  category: { name: 'Comedy', slug: 'comedy' },
  is_free: true,
  entry_mode: 'walk_in',
  external_ticket_url: null,
  ticket_tiers: [],
}
const ev = (o: Partial<DirectoryInput>): DirectoryInput => ({ ...base, ...o })

describe("What's on: a day grouped directory", () => {
  const now = new Date('2026-10-31T13:30:00Z') // Sunday 1 November, 00:30 in Melbourne

  it('groups nights by the day they happen in their own zone, labelled in words, today and tomorrow tagged', () => {
    const days = directoryDays(
      [
        ev({ id: 'a', slug: 'a', start_date: '2026-11-01T09:00:00Z' }), // Sun 1 Nov 8 pm
        ev({ id: 'b', slug: 'b', start_date: '2026-11-01T14:00:00Z' }), // Mon 2 Nov 1 am
        ev({ id: 'c', slug: 'c', start_date: '2026-11-03T08:30:00Z' }), // Tue 3 Nov
      ],
      now,
    )
    expect(days.map((d) => d.label)).toEqual(['Sunday 1 November', 'Monday 2 November', 'Tuesday 3 November'])
    expect(days.map((d) => d.tag)).toEqual(['Today', 'Tomorrow', null])
    expect(days[0].rows[0]).toMatchObject({ href: '/events/a', time: '8:00 pm', city: 'Ballarat', category: 'Comedy', free: true })
  })

  it('puts Geelong and Melbourne first within a day (plan v4), each part in time order', () => {
    const [day] = directoryDays(
      [
        ev({ id: 'b1', slug: 'b1', venue_city: 'Bendigo', start_date: '2026-11-01T01:00:00Z' }),
        ev({ id: 'm1', slug: 'm1', venue_city: 'Melbourne', start_date: '2026-11-01T08:00:00Z' }),
        ev({ id: 'g1', slug: 'g1', venue_city: 'Geelong', start_date: '2026-11-01T03:00:00Z' }),
      ],
      now,
    )
    expect(day.rows.map((r) => r.href)).toEqual(['/events/g1', '/events/m1', '/events/b1'])
  })

  it('says the price the card says: a night sold elsewhere is never Free', () => {
    const [day] = directoryDays(
      [ev({ is_free: false, entry_mode: 'tickets', external_ticket_url: 'https://www.ticketek.com.au/x' })],
      now,
    )
    expect(day.rows[0].free).toBe(false)
    expect(day.rows[0].price).not.toMatch(/^Free/)
  })
})

describe('Featured this week: a real photo with its rights on record, or no row', () => {
  const row = (id: string, o: { cover?: string | null; credit?: string | null }) => ({
    id,
    cover_image_url: o.cover ?? null,
    image_credit: o.credit ?? null,
  })

  it('takes approved venue photos (credited) and organiser photos recorded as authorised or licensed, nothing else', () => {
    const picked = featuredWithRecordedRights(
      [
        row('venue', { cover: 'https://upload.wikimedia.org/a.jpg', credit: 'Photo: A, CC BY 4.0' }),
        row('authorised', { cover: 'https://x.supabase.co/storage/v1/object/public/event-images/b.jpg' }),
        row('unrecorded', { cover: 'https://x.supabase.co/storage/v1/object/public/event-images/c.jpg' }),
        row('library', { cover: 'https://images.pexels.com/d.jpg' }),
        row('none', {}),
      ],
      new Map([
        ['authorised', 'organiser_authorised'],
        ['unrecorded', 'unrecorded'],
        ['library', 'platform_library'],
      ]),
      4,
    )
    expect(picked.map((r) => r.id)).toEqual(['venue', 'authorised'])
  })

  it('leaves the row out when fewer than two qualify', () => {
    const picked = featuredWithRecordedRights(
      [row('venue', { cover: 'https://upload.wikimedia.org/a.jpg', credit: 'Photo: A' })],
      new Map(),
      4,
    )
    expect(picked).toEqual([])
  })
})

describe('the discovery rows say only what is held', () => {
  const now = new Date('2026-10-31T13:30:00Z')
  it('shows no time for a night stored at midnight in its own zone', () => {
    const [day] = directoryDays([ev({ start_date: '2026-11-01T13:00:00Z' })], now) // 00:00 Mon 2 Nov, Melbourne
    expect(day.rows[0].time).toBeNull()
  })
  it('names where every row is booked by the seller, never by a domain (Lawal 2 November 09:00, refinement 1)', () => {
    const paid = (url: string) => sourceLabel(ev({ is_free: false, entry_mode: 'tickets', external_ticket_url: url }))
    expect(sourceLabel(ev({}))).toBe('Free · Walk in')
    expect(sourceLabel(ev({ is_free: false, entry_mode: 'tickets', ticket_tiers: [{ price: 2500, currency: 'AUD' }] }))).toBe('Book on EventLinqs')
    expect(paid('https://premier.ticketek.com.au/shows/x')).toBe('Tickets at Ticketek')
    expect(paid('https://geelongartscentre.org.au/whats-on/all-events/kate-ceberano/')).toBe('Tickets at Geelong Arts Centre')
    expect(paid('https://tickets.birdsbasement.com/4/?x=EV1')).toBe('Tickets at Bird’s Basement')
    expect(paid('https://tickets.myguestlist.com/x/')).toBe('Get tickets')
    expect(sourceLabel(ev({ is_free: true, entry_mode: 'registration', external_ticket_url: 'https://events.grlc.vic.gov.au/event/1' }))).toMatch(/^(Register at Geelong Regional Libraries|Free · Walk in)$/)
    for (const url of ['https://geelongartscentre.org.au/x', 'https://events.grlc.vic.gov.au/x', 'https://boxoffice.gotix.com.au/x', 'https://tickets.myguestlist.com/x']) {
      expect(paid(url)).not.toMatch(/\.(com|org|au)\b/)
    }
  })
  it('a row never shows the price line’s words about where it is sold as its price', () => {
    expect(rowPrice('Tickets on geelongartscentre.org.au')).toBe('')
    expect(rowPrice('Tickets are sold elsewhere')).toBe('')
    expect(rowPrice('From AUD $15')).toBe('From AUD $15')
    expect(rowPrice('Free entry')).toBe('Free entry')
  })
  it('knows this weekend from the platform zone: on a Sunday it is today alone', () => {
    const d = discoveryDays(new Date('2026-10-31T13:30:00Z')) // Sunday 1 November in Sydney
    expect(d.todayKey).toBe('2026-11-01')
    expect(d.weekendKeys).toEqual(['2026-11-01'])
    expect(d.weekKeys).toHaveLength(7)
  })
  it('on a Monday the weekend is Friday, Saturday AND Sunday: every day of the one window, never its ends alone', () => {
    const d = discoveryDays(new Date('2026-11-02T03:00:00Z')) // Monday 2 November in Sydney
    expect(d.weekendKeys).toEqual(['2026-11-06', '2026-11-07', '2026-11-08'])
  })
  it('suburbOf reads the suburb before the state code, and falls back to the city only when no part names one', () => {
    // 2 November: a heredoc turned this pattern's \b into a BACKSPACE, so every address fell back to the city and the
    // suburb filter offered one choice; no-control-characters caught it. This pins the reading itself.
    expect(suburbOf('Costa Hall, 1 Gheringhap St, Geelong VIC 3220', 'Geelong')).toBe('Geelong')
    expect(suburbOf('12 Bay St, Belmont VIC 3216', 'Geelong')).toBe('Belmont')
    expect(suburbOf('Pakington St, Geelong West Vic 3218, Australia', 'Geelong')).toBe('Geelong West')
    expect(suburbOf('The Barwon Club', 'Geelong')).toBe('Geelong')
    expect(suburbOf(null, null)).toBeNull()
  })
  it('windowDayKeys lists the middle day of a three day window', () => {
    expect(windowDayKeys(new Date('2026-11-05T13:00:00Z'), new Date('2026-11-08T12:59:59.999Z'))).toEqual(['2026-11-06', '2026-11-07', '2026-11-08'])
  })
})
