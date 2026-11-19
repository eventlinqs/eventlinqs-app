import { describe, expect, test } from 'vitest'
import { buildEventSchemaPayload } from '@/components/features/events/event-schema-jsonld'
import { statedPostcode } from '@/lib/seo/event-schema'
import { INDEXNOW_WINDOW_MS, notifyIndexNow, type IndexNowDeps } from '../../../src/lib/seo/indexnow'

/*
 * GOOGLE, TRAIN V (the PM's 22:12 of 19 November 2026, on Lawal's 22:07). Held to Google's own Event page,
 * https://developers.google.com/search/docs/appearance/structured-data/event (last updated 2026-09-08, read 19 November
 * 2026): the required properties are name, startDate and location, 'Set the @type to Place. Add the location.address
 * and location.name properties', the address being 'The venue's detailed street address', recommended as 'Bennelong
 * Point, Sydney NSW 2000, Australia'. And to IndexNow's, https://www.indexnow.org/documentation: a URL 'which has been
 * added, updated, or deleted'.
 */
const BASE = 'https://www.eventlinqs.com.au'

function build(overrides: Record<string, unknown> = {}) {
  return buildEventSchemaPayload({
    event: {
      id: 'evt_v',
      slug: 'geelong-caravanning-and-adventure-leisurefest-geelong-racecourse-2026-11-21',
      title: 'Geelong Caravanning and Adventure Leisurefest',
      status: 'published',
      timezone: 'Australia/Melbourne',
      venue_postal_code: null,
      summary: 'Caravans, camping and the gear to go with them.',
      description: null,
      cover_image_url: 'https://cdn.example.com/cover.avif',
      start_date: '2026-11-20T22:00:00+00:00',
      end_date: '2026-11-21T05:00:00+00:00',
      created_at: '2026-11-01T00:00:00+00:00',
      event_type: 'in_person',
      venue_name: 'Geelong Racecourse',
      venue_address: '99 Breakwater Rd, Breakwater VIC 3219',
      venue_city: 'Geelong',
      venue_state: 'VIC',
      venue_country: 'AU',
      category: { slug: 'festival', name: 'Festival' },
      ...overrides,
    },
    organisation: { name: 'Geelong Racecourse', slug: null, description: null },
    ticketTiers: [],
    state: 'upcoming',
    baseUrl: BASE,
  } as never) as unknown as {
    name?: string
    startDate?: string
    location?: { '@type'?: string; name?: string; address?: { '@type'?: string; postalCode?: string; streetAddress?: string } }
  }
}

describe("Google's required Event properties, every one present and from the record", () => {
  test('name, startDate with its offset, and location as a Place with its name and a PostalAddress', () => {
    const e = build()
    expect(e.name).toBe('Geelong Caravanning and Adventure Leisurefest')
    expect(e.startDate).toMatch(/^2026-11-21T09:00:00\+11:00$/)
    expect(e.location?.['@type']).toBe('Place')
    expect(e.location?.name).toBe('Geelong Racecourse')
    expect(e.location?.address?.['@type']).toBe('PostalAddress')
    expect(e.location?.address?.streetAddress).toBe('99 Breakwater Rd, Breakwater VIC 3219')
  })
})

describe('the postcode the record itself states', () => {
  test.each([
    ['99 Breakwater Rd, Breakwater VIC 3219', '3219'],
    ['Bennelong Point, Sydney NSW 2000, Australia', '2000'],
    ['1 Main St, Darwin NT 0800', '0800'],
    ['12 King St, Perth, Western Australia 6000', '6000'],
    ['17 Lydiard Street South', null],
    ['A Shed (Peel Street end), Queen Victoria Market', null],
    ['Unit 3, 1234 Point Road', null],
    [null, null],
  ])('%s gives %s', (address, want) => {
    expect(statedPostcode(address)).toBe(want)
  })

  test("the row's own postal code wins; with none, the address's; with neither, none is written", () => {
    expect(build({ venue_postal_code: '3220' }).location?.address?.postalCode).toBe('3220')
    expect(build().location?.address?.postalCode).toBe('3219')
    expect(build({ venue_address: '17 Lydiard Street South' }).location?.address).not.toHaveProperty('postalCode')
  })
})

describe('IndexNow is told of a night that ends, beside what changed', () => {
  const cities = new Map([['geelong', 'geelong'], ['melbourne', 'melbourne']])
  function deps(over: Partial<IndexNowDeps> = {}): IndexNowDeps & { posted: { urlList: string[] }[]; windows: [Date, Date][] } {
    const posted: { urlList: string[] }[] = []
    const windows: [Date, Date][] = []
    return {
      posted,
      windows,
      enabled: async () => true,
      changedSince: async () => [{ slug: 'boyz-ii-men-geelong-2026-11-20', venueCity: 'Geelong' }],
      endedSince: async (since, now) => {
        windows.push([since, now])
        return [
          { slug: 'run-the-tan-run-club-2026-11-21', venueCity: 'Melbourne' },
          { slug: 'boyz-ii-men-geelong-2026-11-20', venueCity: 'Geelong' },
        ]
      },
      citySlugs: async () => cities,
      post: async (body) => {
        posted.push(body as { urlList: string[] })
        return 200
      },
      siteUrl: () => BASE,
      ...over,
    }
  }

  test('the ended night is sent once with the changed one, over the same 70 minute window', async () => {
    const now = new Date('2026-11-21T00:00:00Z')
    const d = deps()
    expect(await notifyIndexNow(now, d)).toBe('4 URL(s) sent: accepted')
    expect(d.posted[0].urlList).toEqual([
      `${BASE}/events/boyz-ii-men-geelong-2026-11-20`,
      `${BASE}/events/run-the-tan-run-club-2026-11-21`,
      `${BASE}/city/geelong`,
      `${BASE}/city/melbourne`,
    ])
    expect(d.windows).toEqual([[new Date(now.getTime() - INDEXNOW_WINDOW_MS), now]])
  })

  test('an hour where nothing changed but a night ended still sends that night', async () => {
    const d = deps({ changedSince: async () => [] })
    expect(await notifyIndexNow(new Date('2026-11-21T00:00:00Z'), d)).toMatch(/URL\(s\) sent/)
  })

  test('the drill: without the ended read, only what changed is sent', async () => {
    const d = deps({ endedSince: undefined })
    expect(await notifyIndexNow(new Date('2026-11-21T00:00:00Z'), d)).toBe('2 URL(s) sent: accepted')
  })

  test('a failed ended read is words, never a throw', async () => {
    const d = deps({ endedSince: async () => { throw new Error('the ended events could not be read: x') } })
    expect(await notifyIndexNow(new Date(), d)).toMatch(/^not sent: the ended events could not be read/)
  })
})
