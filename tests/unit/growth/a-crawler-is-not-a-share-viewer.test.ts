import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The share link view beacon, the same class as the page view (a-crawler-is-not-a-viewer.test.ts): a crawler or a
 * headless browser is never written as a person who viewed through a shared link; a person still is.
 */

const recordShareLinkEvent = vi.fn(async () => undefined)
vi.mock('@/lib/broadcast/share-links', () => ({
  isValidShareCode: () => true,
  resolveShareLink: async () => ({ id: 'link-1', event_id: 'event-1' }),
  recordShareLinkEvent,
  visitorHash: () => 'visitor-hash-0001',
}))
vi.mock('@/lib/flags/broadcast', () => ({ isFeatureEnabled: async () => true }))
vi.mock('@/lib/rate-limit/middleware', () => ({ applyRateLimit: vi.fn(async () => null) }))

const { POST } = await import('@/app/api/broadcast/track/route')

function beacon(userAgent: string) {
  return new NextRequest('https://www.eventlinqs.com.au/api/broadcast/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({ code: 'abc123', kind: 'view' }),
  })
}

describe('the share link view beacon', () => {
  beforeEach(() => recordShareLinkEvent.mockClear())

  test('writes a person viewing through a shared link', async () => {
    await POST(beacon('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'))
    expect(recordShareLinkEvent).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['a headless browser', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36'],
    ['a link preview crawler', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
  ])('never writes %s, and answers it the same', async (_who, agent) => {
    const res = await POST(beacon(agent))
    expect(res.status).toBe(200)
    expect(recordShareLinkEvent).not.toHaveBeenCalled()
  })
})
