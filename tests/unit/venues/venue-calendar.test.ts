// D3 (3), a venue gives EventLinqs its own calendar (the DemandOS directive, section 3, "Approved event calendar
// access"). Pinned over fakes: only one of a claimed venue's own people may give it, as the database says; both boxes
// are ticked; a venue has one live calendar at a time; the register row is the partner feed row (partner-feed.ts) with
// the venue's own yes in the constant words, dated today and pointing at the screen where it was given; and the venue
// can stop it, which stops the reading and keeps the record.

import { describe, expect, test } from 'vitest'
import { giveVenueCalendar, stopVenueCalendar, VENUE_CALENDAR_YES_WORDS, type VenueCalendarDeps } from '@/lib/venues/venue-calendar'

const VENUE = '11111111-1111-4111-8111-111111111111'
const USER = '33333333-3333-4333-8333-333333333333'
const ORG = '44444444-4444-4444-8444-444444444444'
const CATEGORY = '55555555-5555-4555-8555-555555555555'
const SOURCE = '66666666-6666-4666-8666-666666666666'

function fake(over: Partial<{ manager: boolean; live: string[]; source: { venueId: string; sourceType: string; collection: string } | null }> = {}) {
  const inserted: Record<string, unknown>[] = []
  const stopped: string[] = []
  const asked: unknown[] = []
  const deps: VenueCalendarDeps = {
    rpc: async (name, args) => {
      asked.push({ name, args })
      return { data: over.manager ?? true, error: null }
    },
    venue: async () => ({ name: 'The Night Cat', citySlug: 'melbourne', organisationId: ORG, organisationName: 'The Night Cat Pty Ltd' }),
    liveCalendars: async () => over.live ?? [],
    insert: async (row) => {
      inserted.push(row)
      return 'new-source'
    },
    source: async () => (over.source === undefined ? { venueId: VENUE, sourceType: 'venue_partnership', collection: 'read' } : over.source),
    stop: async (id) => {
      stopped.push(id)
    },
  }
  return { deps, inserted, stopped, asked }
}

const give = { userId: USER, venueId: VENUE, categoryId: CATEGORY, feedUrl: 'https://thenightcat.com.au/events.ics', ticked: true, authority: true, today: '2026-10-31' }

describe('a venue gives us its calendar', () => {
  test("the register row is the partner feed row, with the venue's own yes, read daily", async () => {
    const { deps, inserted, asked } = fake()
    expect(await giveVenueCalendar(give, deps)).toEqual({ state: 'done', id: 'new-source' })
    expect(asked).toEqual([{ name: 'venue_image_manager', args: { p_user: USER, p_venue: VENUE } }])
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      name: 'The Night Cat (partner feed)',
      source_type: 'venue_partnership',
      page_url: 'https://thenightcat.com.au/events.ics',
      collection: 'read',
      changes: 'daily',
      venue_id: VENUE,
      organisation_id: ORG,
      category_id: CATEGORY,
      city_slug: 'melbourne',
      may_subscribe: 'yes',
      may_subscribe_quote: VENUE_CALENDAR_YES_WORDS,
      may_subscribe_url: 'https://www.eventlinqs.com.au/dashboard/organisation/media',
      may_subscribe_read_on: '2026-10-31',
      may_scrape: 'unknown',
      permits_images: false,
      verification: 'verified',
    })
  })

  test("someone who is not one of the venue's people is refused and nothing is kept", async () => {
    const { deps, inserted } = fake({ manager: false })
    expect(await giveVenueCalendar(give, deps)).toEqual({ state: 'refused', reason: 'Only the people of a claimed venue may give us its calendar.' })
    expect(inserted).toEqual([])
  })

  test('both boxes must be ticked', async () => {
    const { deps, inserted, asked } = fake()
    expect(await giveVenueCalendar({ ...give, authority: false }, deps)).toEqual({ state: 'refused', reason: 'Tick both boxes, so we may read your calendar.' })
    expect(inserted).toEqual([])
    expect(asked).toEqual([])
  })

  test('a venue has one live calendar at a time', async () => {
    const { deps, inserted } = fake({ live: [SOURCE] })
    expect(await giveVenueCalendar(give, deps)).toEqual({ state: 'refused', reason: 'We already read a calendar of yours. Stop it first to give us a new one.' })
    expect(inserted).toEqual([])
  })

  test('the address is refused in the partner feed words when it is not https', async () => {
    const { deps, inserted } = fake()
    expect(await giveVenueCalendar({ ...give, feedUrl: 'webcal://thenightcat.com.au/events.ics' }, deps)).toEqual({ state: 'refused', reason: 'The feed must be an https address.' })
    expect(inserted).toEqual([])
  })
})

describe('a venue stops its calendar', () => {
  test('the reading stops and the record is kept', async () => {
    const { deps, stopped, asked } = fake()
    expect(await stopVenueCalendar(USER, SOURCE, deps)).toEqual({ state: 'done', id: SOURCE })
    expect(stopped).toEqual([SOURCE])
    expect(asked).toEqual([{ name: 'venue_image_manager', args: { p_user: USER, p_venue: VENUE } }])
  })

  test("only the venue's people, and only a venue's own calendar", async () => {
    const stranger = fake({ manager: false })
    expect(await stopVenueCalendar(USER, SOURCE, stranger.deps)).toEqual({ state: 'refused', reason: 'Only the people of a claimed venue may stop its calendar.' })
    expect(stranger.stopped).toEqual([])
    const other = fake({ source: { venueId: VENUE, sourceType: 'licensed_dataset', collection: 'read' } })
    expect(await stopVenueCalendar(USER, SOURCE, other.deps)).toEqual({ state: 'refused', reason: 'That is not a calendar your venue gave us.' })
    const gone = fake({ source: null })
    expect(await stopVenueCalendar(USER, SOURCE, gone.deps)).toEqual({ state: 'refused', reason: 'That is not a calendar your venue gave us.' })
  })
})
