import { describe, it, expect, vi } from 'vitest'

/**
 * HARD-01 proof.
 *
 * The apex (eventlinqs.com) must 308-redirect to the canonical www host so auth
 * cookies and sessions only ever live on one host (the Supabase Auth Site URL
 * is https://www.eventlinqs.com). www, localhost and preview hosts pass through
 * untouched.
 */

// updateSession runs for non-apex hosts; stub its Supabase client so the
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

describe('HARD-01: apex -> www canonical redirect (in the proxy entry)', () => {
  it('308-redirects the bare apex to www, preserving path + query', async () => {
    const res = await proxy(reqFor('https://eventlinqs.com/events?city=sydney'))
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://www.eventlinqs.com/events?city=sydney')
  })

  it('does NOT redirect a request already on www', async () => {
    const res = await proxy(reqFor('https://www.eventlinqs.com/events'))
    // Public route, no auth: updateSession passes through with no redirect.
    expect(res.headers.get('location')).toBeNull()
  })

  it('does NOT redirect the Stripe webhook even on the apex', async () => {
    const res = await proxy(reqFor('https://eventlinqs.com/api/webhooks/stripe'))
    expect(res.status).not.toBe(308)
  })

  it('leaves a localhost dev host untouched', async () => {
    const res = await proxy(reqFor('http://localhost:3000/events'))
    expect(res.status).not.toBe(308)
  })

  it('leaves a vercel preview host untouched', async () => {
    const res = await proxy(reqFor('https://eventlinqs-app-git-x.vercel.app/events'))
    expect(res.status).not.toBe(308)
  })
})
