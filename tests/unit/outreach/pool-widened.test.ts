import { describe, expect, it } from 'vitest'
import { cityFromOwnPages } from '@/lib/outreach/own-city'
import { poolCapFor, POOL_PER_NIGHT, POOL_PER_NIGHT_SHORT, runBasisPool, type PoolCandidate, type PoolStore } from '@/lib/outreach/basis-pool'
import { citiesFromListings, organiserCitySlugs } from '@/lib/outreach/organiser-city'
import { ACQ_GUIDE_CITIES } from '@/lib/outreach/acq-target'

/**
 * THE POOL WIDENED (the PM's 10:30 of 22 November 2026, items (a) to (c); Lawal's outreach engine rebuild of 10:31,
 * sections 1, 3 and 6). That morning Monday's acquisition pool read 0: 150 of 229 real organisers had no city, and the
 * night's pool turn had recorded 0 of 12 because it took only an address at the organiser's own domain.
 */

describe("an organiser's city from its own pages", () => {
  const page = (url: string, text: string) => ({ url, html: `<html><body><p>${text}</p></body></html>` })

  it("reads a 'based in' line and an address with its state, quoting the words and the page", () => {
    const based = cityFromOwnPages([page('https://nextstop.example/about', 'We are a comedy night based in Geelong, every month.')], ACQ_GUIDE_CITIES)
    expect(based).toMatchObject({ city: 'geelong', pageUrl: 'https://nextstop.example/about', form: 'based in' })
    expect(based?.quote).toContain('based in Geelong')
    const address = cityFromOwnPages([page('https://hall.example/contact', 'Find us: 12 Main Street, Ballarat VIC 3350')], ACQ_GUIDE_CITIES)
    expect(address).toMatchObject({ city: 'ballarat', form: 'address' })
  })

  it("a 'based in' line outranks an address; two cities in the same form is no answer; a street named after a city is none", () => {
    expect(cityFromOwnPages([page('https://a.example/', 'Based in Melbourne. Our Geelong VIC show is in May.')], ACQ_GUIDE_CITIES)?.city).toBe('melbourne')
    expect(cityFromOwnPages([page('https://b.example/', 'Shows at 1 Bay St, Geelong VIC 3220 and 9 Lyttleton St, Bendigo VIC 3550')], ACQ_GUIDE_CITIES)).toBeNull()
    expect(cityFromOwnPages([page('https://c.example/', '45 Melbourne Street, North Adelaide SA')], ACQ_GUIDE_CITIES)).toBeNull()
    expect(cityFromOwnPages([page('http://d.example/', 'based in Bendigo')], ACQ_GUIDE_CITIES)).toBeNull()
  })
})

describe("the night's cap", () => {
  it('reads sixty while the coming week holds fewer than sixty first letters, then twelve', () => {
    expect(poolCapFor(0)).toBe(POOL_PER_NIGHT_SHORT)
    expect(poolCapFor(59)).toBe(POOL_PER_NIGHT_SHORT)
    expect(poolCapFor(60)).toBe(POOL_PER_NIGHT)
    expect([POOL_PER_NIGHT_SHORT, POOL_PER_NIGHT]).toEqual([60, 12])
  })
})

describe('the pool turn', () => {
  const site = (host: string, body: string) => ({ [`https://${host}/robots.txt`]: '', [`https://${host}/`]: body })
  const pagesBy: Record<string, string> = {
    ...site('one.example', '<p>Bookings: onenights@gmail.com. Based in Geelong.</p>'),
    ...site('two.example', '<p>Contact: hello@two.example</p>'),
    ...site('three.example', '<p>Contact: hi@three.example</p>'),
  }
  const fetcher = (async (url: string) => {
    const body = pagesBy[url]
    return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 })
  }) as never

  function store(candidates: PoolCandidate[], failOn?: string) {
    const recorded: { organiserId: string; address: string; kind?: string; quote?: string; inGuideCity?: boolean }[] = []
    const cities: { organiserId: string; city: string }[] = []
    const s: PoolStore = {
      async candidates() {
        return candidates
      },
      async record(r) {
        if (r.organiserId === failOn) throw new Error('the database refused it')
        recorded.push({ organiserId: r.organiserId, address: r.address, kind: r.kind, quote: r.quote, inGuideCity: r.inGuideCity })
        return true
      },
      async recordCity(r) {
        cities.push({ organiserId: r.organiserId, city: r.place.city })
        return true
      },
    }
    return { s, recorded, cities }
  }
  const c = (id: string, host: string, over: Partial<PoolCandidate> = {}): PoolCandidate => ({ id, name: id, website: `https://${host}/`, known: [], ...over })

  it("places an organiser by its own page and records its free mail address as a guide city's, with its quote", async () => {
    const m = store([c('one', 'one.example', { cityKnown: false })])
    const out = await runBasisPool(m.s, fetcher, new Date('2026-11-22T12:30:00Z'), Date.now() + 60_000, { pauseMs: 0 })
    expect(m.cities).toEqual([{ organiserId: 'one', city: 'geelong' }])
    expect(m.recorded).toEqual([expect.objectContaining({ organiserId: 'one', address: 'onenights@gmail.com', kind: 'free mail', inGuideCity: true })])
    expect(m.recorded[0].quote).toContain('Bookings:')
    expect(out[0].outcome).toMatch(/1 recorded; placed in geelong by its own page/)
  })

  it('one organiser that fails is its own line and never stops the rest of the batch', async () => {
    const m = store([c('two', 'two.example', { cityKnown: true }), c('three', 'three.example', { cityKnown: true })], 'two')
    const out = await runBasisPool(m.s, fetcher, new Date('2026-11-22T12:30:00Z'), Date.now() + 60_000, { pauseMs: 0, atOnce: 1 })
    expect(out.map((o) => o.organiser)).toEqual(['two', 'three'])
    expect(out[0].outcome).toMatch(/^the read failed: the database refused it/)
    expect(m.recorded.map((r) => r.address)).toEqual(['hi@three.example'])
  })

  it('never reads more than the cap, and never starts a site after the deadline', async () => {
    const many = Array.from({ length: 5 }, (_, i) => c(`o${i}`, 'two.example', { cityKnown: true }))
    expect(await runBasisPool(store(many).s, fetcher, new Date(), Date.now() + 60_000, { pauseMs: 0, cap: 3 })).toHaveLength(3)
    expect(await runBasisPool(store(many).s, fetcher, new Date(), Date.now() - 1, { pauseMs: 0 })).toEqual([])
  })
})

describe("roads 4 and 5 of an organiser's city", () => {
  it("road 4: an upcoming listing whose shown organiser is theirs (the host it names, else its venue), the soonest first", () => {
    const out = citiesFromListings(
      [
        { id: 'host', name: 'Next Stop Comedy' },
        { id: 'venue', name: 'Here & Now Lounge' },
        { id: 'nobody', name: 'Somebody Else' },
      ],
      [
        { venue_name: 'The Albion', metadata: { host_name: 'next stop comedy' }, city_primary: 'melbourne', start_date: '2027-02-01T09:00:00Z' },
        { venue_name: 'Here & Now Lounge', metadata: { host_name: 'Next Stop  Comedy ' }, city_primary: 'geelong', start_date: '2027-01-09T09:00:00Z' },
        { venue_name: 'Here & Now Lounge', metadata: {}, city_primary: 'geelong', start_date: '2027-01-10T09:00:00Z' },
      ],
    )
    expect(Object.fromEntries(out)).toEqual({ host: 'geelong', venue: 'geelong' })
  })

  it('road 5: the city its own pages print, read only when no earlier road placed it', async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      organisers: [
        { id: 'printed', name: 'Printed', city_slug: 'bendigo' },
        { id: 'blank', name: 'Blank', city_slug: null },
      ],
    }
    const chainFor = (table: string) => {
      let rows = [...(tables[table] ?? [])]
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: (col: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[col]))), chain),
        eq: () => chain,
        is: () => chain,
        not: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        range: (from: number, to: number) => ((rows = rows.slice(from, to + 1)), chain),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok),
      }
      return chain
    }
    const out = await organiserCitySlugs({ from: chainFor } as never, [{ id: 'printed', found_on: null, organisation_id: null }, { id: 'blank', found_on: null, organisation_id: null }], new Date('2026-11-22T00:00:00Z'))
    expect(Object.fromEntries(out)).toEqual({ printed: 'bendigo' })
  })
})
