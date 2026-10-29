import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * A CRAWLER IS NOT A PERSON WHO VIEWED THE LISTING (window 5, 29 October 2026). The finish pass of 28 October drove
 * production in a headless browser, and every event page it opened sent the page view beacon; the demand route wrote
 * it, so a QA run counted as people who opened the listing, in item 20's after-event report, the organiser's report
 * after the night and the growth page. The press out route already refuses a crawler (src/lib/broadcast/crawler.ts);
 * the page view now does the same, and a person's view is still written.
 */

const recordDemand = vi.fn(async () => undefined)
vi.mock('@/lib/ledger/adapter', () => ({ recordDemand, LEDGER_EVENT_COLUMNS: 'id' }))
vi.mock('@/lib/rate-limit/middleware', () => ({ applyRateLimit: vi.fn(async () => null) }))
vi.mock('@/lib/after-response', () => ({ afterResponse: (_label: string, run: () => Promise<unknown>) => void run() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: EVENT, status: 'published', visibility: 'public' } }) }) }),
    }),
  }),
}))

const EVENT = '11111111-1111-4111-8111-111111111111'
const { POST } = await import('@/app/api/ledger/demand/route')

function beacon(userAgent: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }
  if (userAgent !== null) headers['user-agent'] = userAgent
  return new NextRequest('https://www.eventlinqs.com.au/api/ledger/demand', { method: 'POST', headers, body: JSON.stringify({ eventId: EVENT, action: 'page_view' }) })
}

describe('the page view beacon', () => {
  beforeEach(() => recordDemand.mockClear())

  test('writes a person viewing the listing', async () => {
    const res = await POST(beacon('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'))
    expect(res.status).toBe(200)
    await Promise.resolve()
    expect(recordDemand).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['a headless browser (a QA drive, a screenshot run)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36'],
    ['Lighthouse', 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome-Lighthouse'],
    ['a link preview crawler', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
    ['a search crawler', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ])('never writes %s as a view, and answers it the same', async (_who, agent) => {
    const res = await POST(beacon(agent))
    expect(res.status).toBe(200)
    await Promise.resolve()
    expect(recordDemand).not.toHaveBeenCalled()
  })

  test('never writes a beacon with no user agent', async () => {
    await POST(beacon(null))
    await Promise.resolve()
    expect(recordDemand).not.toHaveBeenCalled()
  })
})
