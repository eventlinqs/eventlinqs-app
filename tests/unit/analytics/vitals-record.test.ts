import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * THE REAL VISITOR RECORD (Lawal's law of 10 November 2026, 13:30, internal only; the PM's ruling of 15:05 (2): 'Record
 * LCP, INP and CLS from real visitors through Next.js's own web vitals hook, as numbers only: no personal data, no
 * identifiers, no cookie, nothing shown on any page').
 *
 * The browser sends a measure as numbers only (vitalsBody); the route keeps it as numbers only (vitalsRow), never a
 * crawler's, never under the kill switch, and never anything that identifies the sender.
 */
const insert = vi.fn(async (_row: unknown) => ({ error: null as null | { message: string } }))
vi.mock('@/lib/rate-limit/middleware', () => ({ applyRateLimit: vi.fn(async () => null) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => ({ insert: (row: unknown) => insert({ table, row }) }) }) }))

const { pageTypeOf, vitalsBody, vitalsRow, vitalsRows, MAX_MEASURES_PER_VIEW } = await import('@/lib/analytics/vitals-record')
const { POST } = await import('@/app/api/vitals/route')

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
function beacon(body: unknown, userAgent: string | null = PHONE) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }
  if (userAgent !== null) headers['user-agent'] = userAgent
  return new NextRequest('https://www.eventlinqs.com.au/api/vitals', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

describe('what the browser sends', () => {
  test('the page by its kind, never its address', () => {
    expect(pageTypeOf('/')).toBe('home')
    expect(pageTypeOf('/city/geelong')).toBe('city')
    expect(pageTypeOf('/city/melbourne/fitzroy')).toBe('suburb')
    expect(pageTypeOf('/state/victoria')).toBe('state')
    expect(pageTypeOf('/events/boyz-ii-men-mt-duneed-estate-2026-11-28')).toBe('event')
    expect(pageTypeOf('/events?q=jazz')).toBe('events')
    expect(pageTypeOf('/community/african/melbourne')).toBe('community')
    expect(pageTypeOf('/start/')).toBe('start')
    expect(pageTypeOf('/admin/today')).toBe('other')
  })

  test('LCP, INP, CLS, TTFB and FCP as numbers, phone apart from desktop; any other measure is not sent', () => {
    expect(vitalsBody({ name: 'LCP', value: 2310.4, rating: 'needs-improvement' }, '/city/geelong', true)).toEqual({ m: 'LCP', v: 2310, p: 'city', d: 'mobile', r: 'needs-improvement' })
    expect(vitalsBody({ name: 'CLS', value: 0.012345, rating: 'good' }, '/', false)).toEqual({ m: 'CLS', v: 0.0123, p: 'home', d: 'desktop', r: 'good' })
    expect(vitalsBody({ name: 'INP', value: 88, rating: 'good' }, '/events', true)?.m).toBe('INP')
    expect(vitalsBody({ name: 'FCP', value: 900.6, rating: 'good' }, '/', true)).toEqual({ m: 'FCP', v: 901, p: 'home', d: 'mobile', r: 'good' })
    expect(vitalsBody({ name: 'TTFB', value: 120.2 }, '/events/x', true)).toEqual({ m: 'TTFB', v: 120, p: 'event', d: 'mobile', r: null })
    expect(vitalsBody({ name: 'FID', value: 12 }, '/', true)).toBeNull()
    expect(vitalsBody({ name: 'LCP', value: Number.NaN }, '/', true)).toBeNull()
  })

  test('the body names nothing but the five fields', () => {
    const body = vitalsBody({ name: 'LCP', value: 1500, rating: 'good' }, '/city/geelong?ref=abc', true)
    expect(Object.keys(body ?? {}).sort()).toEqual(['d', 'm', 'p', 'r', 'v'])
    expect(JSON.stringify(body)).not.toMatch(/geelong|ref|abc/)
  })
})

describe('what the server keeps', () => {
  beforeEach(() => insert.mockClear())

  test('a real visitor measure, as numbers only', async () => {
    const res = await POST(beacon({ m: 'LCP', v: 2310, p: 'city', d: 'mobile', r: 'needs-improvement' }))
    expect(res.status).toBe(204)
    expect(insert).toHaveBeenCalledWith({
      table: 'page_vitals',
      row: [{ page_type: 'city', device: 'mobile', metric: 'LCP', value: 2310, rating: 'needs-improvement' }],
    })
  })

  test.each([
    ['Lighthouse', 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome-Lighthouse'],
    ['a headless browser', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36'],
    ['no user agent at all', null],
  ])('never %s', async (_label, ua) => {
    const res = await POST(beacon({ m: 'LCP', v: 2310, p: 'city', d: 'mobile', r: null }, ua))
    expect(res.status).toBe(204)
    expect(insert).not.toHaveBeenCalled()
  })

  test.each([
    ['another measure', { m: 'FID', v: 900, p: 'city', d: 'mobile', r: null }],
    ['a page kind it does not know', { m: 'LCP', v: 900, p: 'https://evil.example/', d: 'mobile', r: null }],
    ['a device it does not know', { m: 'LCP', v: 900, p: 'city', d: 'iPhone 15', r: null }],
    ['an impossible value', { m: 'LCP', v: -1, p: 'city', d: 'mobile', r: null }],
    ['a rating it does not know', { m: 'LCP', v: 900, p: 'city', d: 'mobile', r: 'great' }],
  ])('refuses %s', async (_label, body) => {
    const res = await POST(beacon(body))
    expect(res.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  test('an extra field is never kept: the row is built from the five known fields alone', () => {
    expect(vitalsRow({ m: 'LCP', v: 900, p: 'city', d: 'mobile', r: null, email: 'a@b.c', ip: '203.0.113.9' })).toEqual({
      page_type: 'city',
      device: 'mobile',
      metric: 'LCP',
      value: 900,
      rating: null,
    })
  })

  test('a body too large to be a measure is refused before it is read', async () => {
    const res = await POST(beacon('x'.repeat(1100)))
    expect(res.status).toBe(413)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('one beacon per page view (13 November 2026)', () => {
  beforeEach(() => insert.mockClear())
  const m = (metric: string, v: number) => ({ m: metric, v, p: 'event', d: 'mobile', r: null })

  test('the five measures of a page view are kept as five rows from one beacon', async () => {
    const res = await POST(beacon([m('TTFB', 410), m('FCP', 980), m('LCP', 1620), m('CLS', 0.01), m('INP', 120)]))
    expect(res.status).toBe(204)
    expect(insert).toHaveBeenCalledTimes(1)
    const rows = (insert.mock.calls[0][0] as { row: Array<{ metric: string }> }).row
    expect(rows.map((r) => r.metric)).toEqual(['TTFB', 'FCP', 'LCP', 'CLS', 'INP'])
  })

  test('a measure the record does not take is left out and the rest kept', () => {
    expect(vitalsRows([m('LCP', 1620), m('FID', 12)])?.map((r) => r.metric)).toEqual(['LCP'])
  })

  test.each([
    ['nothing at all', []],
    ['more measures than a view has', Array.from({ length: MAX_MEASURES_PER_VIEW + 1 }, (_, i) => m('LCP', i))],
    ['one measure twice', [m('LCP', 1000), m('LCP', 2000)]],
    ['nothing it can keep', [m('FID', 12)]],
  ])('refuses a beacon with %s', async (_label, body) => {
    const res = await POST(beacon(body))
    expect(res.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  test('the browser half sends once, on hide, one value per kind', async () => {
    const sent: string[] = []
    vi.stubGlobal('window', { location: { pathname: '/events/some-night' }, matchMedia: () => ({ matches: true }) })
    vi.stubGlobal('navigator', { sendBeacon: (_url: string, blob: Blob) => (blob.text().then((t) => sent.push(t)), true) })
    const { reportForTest, flushVitals, pendingVitalsForTest } = await import('@/components/analytics/web-vitals-record')
    reportForTest({ name: 'TTFB', value: 400 })
    reportForTest({ name: 'LCP', value: 1500 })
    reportForTest({ name: 'LCP', value: 1700 })
    reportForTest({ name: 'FID', value: 9 })
    expect(pendingVitalsForTest().map((b) => [b.m, b.v])).toEqual([['TTFB', 400], ['LCP', 1700]])
    flushVitals()
    flushVitals()
    await new Promise((r) => setTimeout(r, 0))
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0])).toEqual([
      { m: 'TTFB', v: 400, p: 'event', d: 'mobile', r: null },
      { m: 'LCP', v: 1700, p: 'event', d: 'mobile', r: null },
    ])
    vi.unstubAllGlobals()
  })
})

describe('where it lives', () => {
  test('inside the deferred measurement tree, behind the one kill switch, through Next.js own hook', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    expect(read('src/components/analytics/measurement-stack.tsx')).toMatch(/\{MEASUREMENT_OFF \? null : <WebVitalsRecord \/>\}/)
    expect(read('src/components/analytics/web-vitals-record.tsx')).toContain("import { useReportWebVitals } from 'next/web-vitals'")
    expect(read('src/app/layout.tsx')).not.toContain('WebVitalsRecord')
    const migration = read('supabase/migrations/20261110020001_page_vitals.sql')
    expect(migration).toContain('revoke all on public.page_vitals from anon, authenticated, service_role;')
    expect(migration).toContain('grant select, insert on public.page_vitals to service_role;')
  })
})
