import { describe, it, expect, vi } from 'vitest'

/**
 * IMPACT CAN VERIFY THE APEX (the CONTROLLER's 06:53 of 4 November 2026: Lawal pressed Verify on eventlinqs.com.au at
 * 06:47, 'Website verification failed'). The apex answered only a 301 to www, so a checker that does not follow it never
 * saw the tag. Exactly the apex root, with no query, now answers 200 with a small page whose <head> OPENS with the tag
 * (Impact's own rule: 'Place it at the top, before any other <meta> tags',
 * https://help.impact.com/partner/what-would-you-like-to-learn-about/account-management/account-settings/connect-media-properties/connect-and-verify-a-website),
 * a canonical to www, noindex, and an immediate refresh to www for a person. Every other apex path, and the root with a
 * query (a campaign link), keeps the founder's one-host 301.
 */
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }),
}))

import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

const TAG = '<meta name="impact-site-verification" value="4c53e093-10be-4e4a-9e29-f256cbd89af8">'

describe('the apex root carries the Impact tag', () => {
  it('https://eventlinqs.com.au/ answers 200 with the tag first in its head, canonical www, noindex, and a refresh to www', async () => {
    const res = await proxy(new NextRequest(new URL('https://eventlinqs.com.au/')))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    const html = await res.text()
    const head = html.slice(html.indexOf('<head>') + '<head>'.length)
    expect(head.startsWith(TAG)).toBe(true)
    expect(html).toContain('<link rel="canonical" href="https://www.eventlinqs.com.au/">')
    expect(html).toContain('<meta name="robots" content="noindex, follow">')
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://www.eventlinqs.com.au/">')
  })

  it('the apex root with a query, and every other apex path, keep the one-host 301', async () => {
    for (const u of ['https://eventlinqs.com.au/?utm_source=impact', 'https://eventlinqs.com.au/events', 'https://eventlinqs.com/']) {
      const res = await proxy(new NextRequest(new URL(u)))
      expect(res.status, u).toBe(301)
    }
  })
})
