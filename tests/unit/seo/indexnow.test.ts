import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  INDEXNOW_KEY,
  INDEXNOW_MAX_URLS,
  INDEXNOW_WINDOW_MS,
  indexNowAnswer,
  indexNowBody,
  indexNowUrls,
  notifyIndexNow,
  type IndexNowDeps,
} from '../../../src/lib/seo/indexnow'
import { BROADCAST_FLAG_DEFAULTS } from '../../../src/lib/flags/broadcast'

/**
 * IndexNow (the PM's order 3 of 11 November 2026, addition 3), held to its own page,
 * https://www.indexnow.org/documentation (read 11 November 2026): a key file at the root holding the key, one POST of
 * { host, key, keyLocation, urlList }, at most 10,000 URLs, a key of 8 to 128 characters of a-z, A-Z, 0-9 and dashes.
 */

const SITE = 'https://www.eventlinqs.com.au'
const cities = new Map([['geelong', 'geelong'], ['melbourne', 'melbourne']])
const root = join(__dirname, '..', '..', '..')

function deps(over: Partial<IndexNowDeps> = {}): IndexNowDeps & { posted: unknown[]; since: Date[] } {
  const posted: unknown[] = []
  const since: Date[] = []
  return {
    posted,
    since,
    enabled: async () => true,
    changedSince: async (d) => {
      since.push(d)
      return [
        { slug: 'boyz-ii-men-geelong-2026-11-20', venueCity: 'Geelong' },
        { slug: 'jazz-at-the-forum-2026-11-14', venueCity: 'Melbourne' },
        { slug: 'markets-on-the-bay-2026-11-15', venueCity: 'Geelong ' },
      ]
    },
    citySlugs: async () => cities,
    post: async (body) => {
      posted.push(body)
      return 200
    },
    siteUrl: () => SITE,
    ...over,
  }
}

describe('the key and its file', () => {
  test('the key is what the protocol allows', () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-zA-Z0-9-]{8,128}$/)
  })

  test('the key file at the site root holds exactly the key', () => {
    expect(readFileSync(join(root, 'public', `${INDEXNOW_KEY}.txt`), 'utf8')).toBe(INDEXNOW_KEY)
  })
})

describe('what is sent', () => {
  test('each changed event page, then each city guide once', () => {
    expect(indexNowUrls(SITE, [
      { slug: 'a-night-2026-11-20', venueCity: 'Geelong' },
      { slug: 'b-night-2026-11-21', venueCity: 'geelong' },
      { slug: 'c-night-2026-11-22', venueCity: 'Melbourne' },
    ], cities)).toEqual([
      `${SITE}/events/a-night-2026-11-20`,
      `${SITE}/events/b-night-2026-11-21`,
      `${SITE}/events/c-night-2026-11-22`,
      `${SITE}/city/geelong`,
      `${SITE}/city/melbourne`,
    ])
  })

  test('no slug sends nothing, an unknown city sends no guide, a trailing slash is not doubled', () => {
    expect(indexNowUrls(`${SITE}/`, [{ slug: null, venueCity: 'Geelong' }, { slug: 'x-2026-11-20', venueCity: 'Hobart' }], cities)).toEqual([
      `${SITE}/events/x-2026-11-20`,
    ])
  })

  test('never more than the protocol takes in one post', () => {
    const many = Array.from({ length: INDEXNOW_MAX_URLS + 50 }, (_, i) => ({ slug: `night-${i}`, venueCity: null }))
    expect(indexNowUrls(SITE, many, cities)).toHaveLength(INDEXNOW_MAX_URLS)
  })

  test('the body names the host, the key and where the key lives', () => {
    expect(indexNowBody(`${SITE}/`, [`${SITE}/events/x`])).toEqual({
      host: 'www.eventlinqs.com.au',
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList: [`${SITE}/events/x`],
    })
  })

  test('every answer the protocol lists reads as words', () => {
    expect(indexNowAnswer(200)).toBe('accepted')
    expect(indexNowAnswer(202)).toMatch(/received/)
    expect(indexNowAnswer(403)).toMatch(/key/)
    expect(indexNowAnswer(422)).toMatch(/host/)
    expect(indexNowAnswer(429)).toMatch(/too many/)
    expect(indexNowAnswer(500)).toBe('answered 500')
  })
})

describe('notifyIndexNow', () => {
  test('one post of the changed pages and their guides, read over the last 70 minutes', async () => {
    const d = deps()
    const now = new Date('2026-11-11T01:00:00Z')
    expect(await notifyIndexNow(now, d)).toBe('5 URL(s) sent: accepted')
    expect(d.since).toEqual([new Date(now.getTime() - INDEXNOW_WINDOW_MS)])
    expect(INDEXNOW_WINDOW_MS).toBe(70 * 60_000)
    expect(d.posted).toHaveLength(1)
    expect((d.posted[0] as { urlList: string[] }).urlList).toEqual([
      `${SITE}/events/boyz-ii-men-geelong-2026-11-20`,
      `${SITE}/events/jazz-at-the-forum-2026-11-14`,
      `${SITE}/events/markets-on-the-bay-2026-11-15`,
      `${SITE}/city/geelong`,
      `${SITE}/city/melbourne`,
    ])
  })

  test('the switch off reads nothing and sends nothing', async () => {
    const changedSince = vi.fn()
    const post = vi.fn()
    expect(await notifyIndexNow(new Date(), deps({ enabled: async () => false, changedSince, post }))).toMatch(/switch is off/)
    expect(changedSince).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  test('an hour with no change sends nothing', async () => {
    const post = vi.fn()
    expect(await notifyIndexNow(new Date(), deps({ changedSince: async () => [], post }))).toMatch(/nothing changed/)
    expect(post).not.toHaveBeenCalled()
  })

  test('a refusal is words, never a throw', async () => {
    expect(await notifyIndexNow(new Date(), deps({ post: async () => 429 }))).toBe('5 URL(s) sent: refused: too many requests')
    expect(await notifyIndexNow(new Date(), deps({ post: async () => { throw new Error('timed out') } }))).toBe('not sent: timed out')
    expect(await notifyIndexNow(new Date(), deps({ changedSince: async () => { throw new Error('the changed events could not be read: x') } }))).toMatch(/^not sent: /)
  })

  test('its switch is a governed flag, ON by the order', () => {
    expect(BROADCAST_FLAG_DEFAULTS.indexnow_ping).toBe(true)
  })
})

describe('where it runs', () => {
  test('the hourly listings run sends it last, after every write, with no cron added', () => {
    const route = readFileSync(join(root, 'src', 'app', 'api', 'cron', 'listing-occurrences', 'route.ts'), 'utf8').replace(/\r\n/g, '\n')
    const reports = route.indexOf('sendSellThroughReports(new Date())')
    const notify = route.indexOf('notifyIndexNow(new Date())')
    expect(reports).toBeGreaterThan(0)
    expect(notify).toBeGreaterThan(reports)
    expect(route.indexOf('return NextResponse.json({ ok: true')).toBeGreaterThan(notify)
  })

  test('the reader sends only public, published, cancelled or postponed events', () => {
    const src = readFileSync(join(root, 'src', 'lib', 'seo', 'indexnow.ts'), 'utf8')
    expect(src).toContain(".eq('visibility', 'public')")
    expect(src).toContain("['published', 'cancelled', 'postponed']")
  })
})
