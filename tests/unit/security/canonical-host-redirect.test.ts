import { describe, it, expect, vi } from 'vitest'

/**
 * Canonical host proof.
 *
 * Founder ruling 2026-07-25: www.eventlinqs.com.au is THE canonical host and
 * every other branded host 301s to it. This supersedes the earlier HARD-01
 * ruling (apex -> www.eventlinqs.com, 308), which this file previously encoded.
 *
 * Why it matters beyond tidiness: four branded hosts all answered 200, so auth
 * cookies, sessions, share links, OG cards and the Google index could each
 * settle on a different one. 301 (not 308) is the redirect search engines treat
 * as canonicalisation, which is the point of consolidating them.
 *
 * localhost, *.vercel.app preview hosts and the Stripe webhook path are all
 * exempt - redirecting any of them would break local dev, every preview
 * deployment, or every webhook delivery respectively.
 */

// updateSession runs for non-redirected hosts; stub its Supabase client so the
// pass-through path needs no live auth server.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}))

import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

function reqFor(urlStr: string): NextRequest {
  return new NextRequest(new URL(urlStr))
}

const CANONICAL = 'www.eventlinqs.com.au'

describe('canonical host: every branded host 301s to www.eventlinqs.com.au', () => {
  const redirected = ['eventlinqs.com', 'www.eventlinqs.com', 'eventlinqs.com.au']

  for (const host of redirected) {
    it(`301-redirects ${host} to the canonical host, preserving path + query`, async () => {
      const res = await proxy(reqFor(`https://${host}/events?city=sydney`))
      expect(res.status).toBe(301)
      expect(res.headers.get('location')).toBe(
        `https://${CANONICAL}/events?city=sydney`,
      )
    })
  }

  it('does NOT redirect a request already on the canonical host', async () => {
    const res = await proxy(reqFor(`https://${CANONICAL}/events`))
    // Public route, no auth: updateSession passes through with no redirect.
    expect(res.headers.get('location')).toBeNull()
  })

  it('preserves the path exactly, including a trailing segment and query', async () => {
    const res = await proxy(
      reqFor('https://eventlinqs.com.au/community/greek/melbourne?page=2'),
    )
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe(
      `https://${CANONICAL}/community/greek/melbourne?page=2`,
    )
  })

  it('does NOT redirect the Stripe webhook on any branded host', async () => {
    // Stripe does not follow redirects: a 3xx here silently breaks every
    // delivery, which is why the webhook path is carved out.
    for (const host of redirected) {
      const res = await proxy(reqFor(`https://${host}/api/webhooks/stripe`))
      expect(res.status).not.toBe(301)
    }
  })

  it('leaves a localhost dev host untouched', async () => {
    const res = await proxy(reqFor('http://localhost:3000/events'))
    expect(res.status).not.toBe(301)
  })

  it('leaves a vercel preview host untouched', async () => {
    // If previews redirected, every preview deployment would bounce its own
    // traffic at production and be untestable.
    const res = await proxy(reqFor('https://eventlinqs-app-git-x.vercel.app/events'))
    expect(res.status).not.toBe(301)
  })

  it('leaves the staging alias untouched', async () => {
    const res = await proxy(reqFor('https://eventlinqs-staging.vercel.app/events'))
    expect(res.status).not.toBe(301)
  })
})
