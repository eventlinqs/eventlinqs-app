import { describe, it, expect } from 'vitest'
import {
  INDEXING_CADENCE,
  INDEXING_STALE_AFTER_HOURS,
  VERIFY_COMMAND,
  parseSitemapLocs,
  robotsFromHtml,
  judgeFetched,
  credentialState,
  coverageFromInspections,
  summarise,
  composeHeadline,
  digestLines,
} from '../../../scripts/lib/indexing-check.mjs'

/**
 * CLOSE-OUT SEO2 STEP 3, the weekly indexing check.
 *
 * The acceptance line is "the weekly indexing check runs and returns real
 * counts, proven by a test". The counts it can produce without anybody's
 * permission (submitted, and what the platform itself serves) are tested here
 * against real sitemap and page shapes; the counts that are Google's are tested
 * against a recorded URL Inspection payload shape.
 *
 * The thing most worth pinning is the ABSENCE rule. A check that reports
 * "0 excluded" for a property Google has never been asked about would be lying
 * in exactly the register this check was built to stop, so every test below that
 * touches the unconnected path asserts it SAYS SO.
 */

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://www.eventlinqs.com.au/</loc><changefreq>daily</changefreq></url>
<url><loc>https://www.eventlinqs.com.au/events</loc></url>
<url><loc>https://www.eventlinqs.com.au/events/lane-c-night</loc><lastmod>2026-09-01T00:00:00.000Z</lastmod></url>
<url><loc>https://www.eventlinqs.com.au/events</loc></url>
</urlset>`

describe('parseSitemapLocs', () => {
  it('returns every loc once, in document order', () => {
    expect(parseSitemapLocs(SITEMAP)).toEqual([
      'https://www.eventlinqs.com.au/',
      'https://www.eventlinqs.com.au/events',
      'https://www.eventlinqs.com.au/events/lane-c-night',
    ])
  })

  it('returns nothing rather than throwing on a document that is not a sitemap', () => {
    expect(parseSitemapLocs('<html><body>not a sitemap</body></html>')).toEqual([])
    expect(parseSitemapLocs(undefined)).toEqual([])
  })
})

describe('robotsFromHtml', () => {
  it('reads the robots directive a page declares', () => {
    expect(robotsFromHtml('<head><meta name="robots" content="noindex, follow"/></head>')).toBe('noindex, follow')
  })

  it('answers null when a page declares none, which is not the same as index', () => {
    expect(robotsFromHtml('<head><title>x</title></head>')).toBeNull()
  })

  it('does not mistake the googlebot directive for the robots one', () => {
    expect(robotsFromHtml('<meta name="googlebot" content="noindex">')).toBeNull()
  })
})

describe('judgeFetched', () => {
  it('passes a page that answers 200 and declares nothing', () => {
    expect(judgeFetched({ url: '/a', status: 200, robots: null })).toEqual({ ok: true, fault: null })
  })

  it('fails a URL in the sitemap that does not answer 200', () => {
    const { ok, fault } = judgeFetched({ url: '/a', status: 404, robots: null })
    expect(ok).toBe(false)
    expect(fault).toContain('404')
  })

  it('fails a redirect rather than following it, because Google asks for canonical URLs in a sitemap', () => {
    expect(judgeFetched({ url: '/a', status: 301, robots: null }).ok).toBe(false)
  })

  it('fails a URL the sitemap advertises and the page sends to noindex', () => {
    const { ok, fault } = judgeFetched({ url: '/a', status: 200, robots: 'noindex, follow' })
    expect(ok).toBe(false)
    expect(fault).toContain('noindex')
  })

  it('reports a fetch that never answered as a fetch that never answered', () => {
    const { ok, fault } = judgeFetched({ url: '/a', status: 0, error: 'socket hang up' })
    expect(ok).toBe(false)
    expect(fault).toContain('socket hang up')
  })
})

describe('credentialState', () => {
  it('names the command that fixes it when there is no key', () => {
    const state = credentialState({})
    expect(state.connected).toBe(false)
    expect(state.reason).toContain(VERIFY_COMMAND)
  })

  it('refuses a key that is not JSON, and says which half is wrong', () => {
    expect(credentialState({ GOOGLE_SEARCH_CONSOLE_KEY: 'not json' })).toMatchObject({ connected: false })
    expect(credentialState({ GOOGLE_SEARCH_CONSOLE_KEY: '{"client_email":"a@b.c"}' }).reason).toContain('private_key')
  })

  it('accepts a service-account key and reports which account it will act as', () => {
    const key = JSON.stringify({ client_email: 'indexing@eventlinqs.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----' })
    expect(credentialState({ GOOGLE_SEARCH_CONSOLE_KEY: key })).toMatchObject({
      connected: true,
      clientEmail: 'indexing@eventlinqs.iam.gserviceaccount.com',
    })
  })
})

describe('coverageFromInspections', () => {
  /*
   * The shape is Google's own: inspectionResult.indexStatusResult carries
   * `verdict` (PASS, PARTIAL, FAIL, NEUTRAL) and a human `coverageState`.
   * https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult
   * The indexed count cannot come from sitemaps.get, whose `contents[].indexed`
   * the Sitemaps resource documentation marks deprecated.
   */
  const inspections = [
    { url: '/a', result: { inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' } } } },
    { url: '/b', result: { inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed' } } } },
    { url: '/c', result: { inspectionResult: { indexStatusResult: { verdict: 'FAIL', coverageState: "Excluded by 'noindex' tag" } } } },
    { url: '/d', error: 'HTTP 429 quota exceeded' },
  ]

  it('counts a PASS as indexed and everything else as excluded', () => {
    const { indexed, excluded } = coverageFromInspections(inspections)
    expect(indexed).toBe(1)
    expect(excluded).toHaveLength(3)
  })

  it("repeats Google's own reason verbatim, so it can be pasted back into Search Console", () => {
    const { excluded } = coverageFromInspections(inspections)
    expect(excluded[0]).toEqual({ url: '/b', reason: 'Crawled - currently not indexed' })
    expect(excluded[1].reason).toBe("Excluded by 'noindex' tag")
  })

  it('does not silently drop a URL Google refused to answer about', () => {
    const { excluded } = coverageFromInspections(inspections)
    expect(excluded[2]).toEqual({ url: '/d', reason: 'HTTP 429 quota exceeded' })
  })
})

describe('summarise and the one line it produces', () => {
  const fetched = [
    { url: 'https://x/a', status: 200, robots: null },
    { url: 'https://x/b', status: 404, robots: null },
    { url: 'https://x/c', status: 200, robots: 'noindex, follow' },
  ]

  it('returns real counts: what was submitted, what was checked, and what served cleanly', () => {
    const state = summarise({ site: 'https://x', at: '2026-09-14T00:00:00.000Z', submitted: 37, fetched })
    expect(state.submitted).toBe(37)
    expect(state.checked).toBe(3)
    expect(state.served).toBe(1)
    expect(state.faults).toHaveLength(2)
  })

  it('says Search Console is not connected rather than reporting nothing excluded', () => {
    const state = summarise({ site: 'https://x', at: '2026-09-14T00:00:00.000Z', submitted: 37, fetched: [] })
    expect(state.headline).toContain('Search Console not connected')
    expect(state.searchConsole.indexed).toBeNull()
  })

  it('carries the indexed and excluded counts when Google has answered', () => {
    const line = composeHeadline({
      submitted: 37,
      served: 37,
      checked: 37,
      faults: [],
      searchConsole: { connected: true, indexed: 30, excluded: [{ url: '/x', reason: 'Crawled - currently not indexed' }] },
    })
    expect(line).toContain('30 indexed by Google')
    expect(line).toContain('1 excluded')
  })
})

describe('the digest line', () => {
  const humanAge = (h: number) => `${h} hours`

  it('reports an absent result as an absent result, naming the cadence', () => {
    expect(digestLines(null, humanAge)).toEqual([expect.stringContaining(INDEXING_CADENCE)])
  })

  it('marks a result older than the cadence OVERDUE rather than printing it as today', () => {
    const lines = digestLines(
      { headline: 'x', site: 'https://x', ageHours: INDEXING_STALE_AFTER_HOURS + 1, stale: true, faults: [], searchConsole: null },
      humanAge,
    )
    expect(lines.join(' ')).toContain('THIS IS OVERDUE')
  })

  it('names the broken URLs the sitemap is advertising', () => {
    const lines = digestLines(
      {
        headline: 'x',
        site: 'https://x',
        ageHours: 1,
        stale: false,
        faults: [{ url: 'https://x/b', fault: 'answered HTTP 404, and the sitemap advertises it to Googlebot' }],
        searchConsole: { connected: true, indexed: 1, excluded: [] },
      },
      humanAge,
    )
    expect(lines.join(' ')).toContain('https://x/b')
    expect(lines.join(' ')).toContain('404')
  })

  it('carries the reason Google gave for each exclusion', () => {
    const lines = digestLines(
      {
        headline: 'x',
        site: 'https://x',
        ageHours: 1,
        stale: false,
        faults: [],
        searchConsole: { connected: true, indexed: 1, excluded: [{ url: 'https://x/c', reason: "Excluded by 'noindex' tag" }] },
      },
      humanAge,
    )
    expect(lines.join(' ')).toContain("GOOGLE EXCLUDED: https://x/c - Excluded by 'noindex' tag")
  })

  it('repeats the not-connected reason, so a reader is never left to assume', () => {
    const lines = digestLines(
      {
        headline: 'x',
        site: 'https://x',
        ageHours: 1,
        stale: false,
        faults: [],
        searchConsole: { connected: false, reason: 'no GOOGLE_SEARCH_CONSOLE_KEY on this machine' },
      },
      humanAge,
    )
    expect(lines.join(' ')).toContain('no GOOGLE_SEARCH_CONSOLE_KEY')
  })
})
