import { describe, expect, it, vi, beforeEach } from 'vitest'

/*
 * THE EDITION'S WEB COPY ('View in browser', /newsletter/<edition>/<city>/<date>; the PM's order of 21 November 2026,
 * about 03:30). Which answer a request gets, the designed empty state, and the route handler drawing the same builder
 * from the same readers as of the day's 07:00 send, never indexed, never a 404 for a city that has an edition.
 */
const readWhatsOnEdition = vi.fn()
vi.mock('@/lib/newsletter/edition', () => ({ readWhatsOnEdition: (...a: unknown[]) => readWhatsOnEdition(...a) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
const key = vi.fn(() => 'service-role')
vi.mock('@/lib/supabase/env', () => ({ getSupabaseServiceRoleKey: () => key() }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://www.eventlinqs.com.au' }))

const { planWebCopy, webCopyEmptyHtml, FIRST_EDITION_DAY } = await import('@/lib/newsletter/web-copy')
const { GET } = await import('@/app/newsletter/[edition]/[city]/[date]/route')

const NOW = new Date('2026-11-21T05:00:00Z') // 16:00 on Saturday 21 November, Melbourne
const ask = (edition: string, city: string, date: string) => GET(new Request('https://www.eventlinqs.com.au/x'), { params: Promise.resolve({ edition, city, date }) })

describe('planWebCopy', () => {
  it('404s only an edition or a city that has none', () => {
    expect(planWebCopy({ edition: 'monthly', city: 'melbourne', date: '2026-11-21' }, NOW).kind).toBe('not_found')
    expect(planWebCopy({ edition: 'weekend', city: 'sydney', date: '2026-11-21' }, NOW).kind).toBe('not_found')
  })

  it('answers the empty state for a date that is not a day, before the first edition, or not yet sent', () => {
    expect(planWebCopy({ edition: 'weekend', city: 'melbourne', date: 'tomorrow' }, NOW)).toMatchObject({ kind: 'empty', reason: 'not_a_day' })
    expect(planWebCopy({ edition: 'weekend', city: 'melbourne', date: '2026-11-14' }, NOW)).toMatchObject({ kind: 'empty', reason: 'before_the_first' })
    expect(planWebCopy({ edition: 'week', city: 'geelong', date: '2026-11-25' }, NOW)).toMatchObject({ kind: 'empty', reason: 'not_yet_sent' })
    expect(FIRST_EDITION_DAY).toBe('2026-11-21')
  })

  it("reads a sent edition as of its day's 07:00 in Melbourne", () => {
    const plan = planWebCopy({ edition: 'weekend', city: 'ballarat', date: '2026-11-21' }, NOW)
    expect(plan.kind).toBe('edition')
    if (plan.kind === 'edition') {
      expect(plan.sendAt.toISOString()).toBe('2026-11-20T20:00:00.000Z')
      expect(plan.city).toEqual({ slug: 'ballarat', name: 'Ballarat' })
    }
  })
})

describe('the empty state', () => {
  it("says what happened and opens the city's guide in one press", () => {
    const html = webCopyEmptyHtml({ origin: 'https://www.eventlinqs.com.au', cityName: 'Geelong', citySlug: 'geelong', edition: 'week', reason: 'not_yet_sent' })
    expect(html).toContain('data-web-copy-empty')
    expect(html).toContain('This edition has not gone out yet.')
    expect(html).toContain('href="https://www.eventlinqs.com.au/city/geelong"')
    expect(html).toContain('href="https://www.eventlinqs.com.au/newsletter"')
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">')
    expect(html).not.toMatch(/[–—]/)
  })
})

describe('GET /newsletter/<edition>/<city>/<date>', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    readWhatsOnEdition.mockReset()
    key.mockReturnValue('service-role')
  })

  it('404s a city with no edition', async () => {
    const res = await ask('weekend', 'sydney', '2026-11-21')
    expect(res.status).toBe(404)
  })

  it('answers 200 with the empty state, never a 404, for a day not yet sent', async () => {
    const res = await ask('week', 'melbourne', '2026-11-25')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await res.text()).toContain('data-web-copy-empty')
    expect(readWhatsOnEdition).not.toHaveBeenCalled()
  })

  it("draws the edition from the send's readers as of 07:00 that day, with no View in browser link to itself", async () => {
    readWhatsOnEdition.mockResolvedValue({
      period: { start: '2026-11-21', end: '2026-11-22' },
      edition: {
        edition: 'weekend', editionId: 'weekend-melbourne-2026-11-21', cityName: 'Melbourne', citySlug: 'melbourne', datesLabel: 'Sat 21 to Sun 22 Nov 2026',
        subjectDates: 'Sat 21 to Sun 22 Nov', areaLabel: 'Melbourne & Surrounds', heroImage: null, intro: 'Here is the best of this weekend in Melbourne.',
        featured: null, highlights: [], free: null, gem: null, drive: null, alerts: [], origin: 'https://www.eventlinqs.com.au',
        unsubscribeUrl: 'https://www.eventlinqs.com.au/newsletter/city', manageUrl: 'https://www.eventlinqs.com.au/newsletter/city',
        referUrl: 'https://www.eventlinqs.com.au/newsletter/refer', webUrl: 'https://www.eventlinqs.com.au/newsletter/weekend/melbourne/2026-11-21',
      },
    })
    const res = await ask('weekend', 'melbourne', '2026-11-21')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(readWhatsOnEdition.mock.calls[0][1]).toMatchObject({ citySlug: 'melbourne', edition: 'weekend', unsubscribeUrl: 'https://www.eventlinqs.com.au/newsletter/city' })
    expect((readWhatsOnEdition.mock.calls[0][1] as { now: Date }).now.toISOString()).toBe('2026-11-20T20:00:00.000Z')
    expect(html).toContain('What&#8217;s On in')
    expect(html).not.toContain('View in browser')
    expect(html).toContain('href="https://www.eventlinqs.com.au/newsletter/city"')
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('a failed read or no key answers 503 with the empty state, never a 500', async () => {
    readWhatsOnEdition.mockRejectedValue(new Error('socket hang up'))
    const failed = await ask('weekend', 'bendigo', '2026-11-21')
    expect(failed.status).toBe(503)
    expect(await failed.text()).toContain('could not be read just now')
    key.mockReturnValue('')
    const keyless = await ask('weekend', 'bendigo', '2026-11-21')
    expect(keyless.status).toBe(503)
  })
})
