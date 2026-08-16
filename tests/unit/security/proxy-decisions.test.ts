/**
 * The four security decisions in src/proxy.ts, pinned.
 *
 * WHY THIS EXISTS. next@16.2.7 was in the affected range for GHSA-6gpp-xcg3-4w24,
 * "Middleware / Proxy bypass in App Router applications using Turbopack", and
 * this project builds with Turbopack. That matters more here than it would in
 * most applications, because src/proxy.ts is where FOUR separate security
 * decisions live, so one bypass defeats all four at once:
 *
 *   1. host canonicalisation      one host, so cookies/sessions/index agree
 *   2. the /dev/* production gate three preview pages must 404 in production
 *   3. the queue admission gate   a signed token admits to ONE event, not all
 *   4. session refresh            every other request delegates to updateSession
 *
 * The advisory is fixed by the version bump, not by anything in this file: no
 * test written here can prove Next's own router does not bypass its proxy. What
 * these tests DO prove is the other half, which is the half a version bump can
 * break: that the four decisions still behave correctly on the version now
 * installed. Run against next@16.2.11.
 *
 * Decision 3 deserves its own note, because it is the subtlest of the four and
 * the code comment records it as a real past defect: the gate used to check only
 * that a token was VALID and threw away the event it was issued for. A signature
 * proves ISSUANCE, never SCOPE, so one legitimately earned token for a quiet
 * event admitted the bearer to every high-demand event on the platform, which is
 * the entire thing the queue exists to prevent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The proxy reaches for Supabase and the token validator. Both are mocked so the
// routing decisions can be driven in isolation.
const updateSession = vi.fn()
const validateAdmissionToken = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (req: unknown) => updateSession(req),
}))
vi.mock('@/lib/queue/tokens', () => ({
  validateAdmissionToken: (t: string) => validateAdmissionToken(t),
}))
vi.mock('@/lib/supabase/env', () => ({
  getSupabaseUrl: () => 'https://test.supabase.co',
  getSupabaseAnonKey: () => 'anon-key',
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}))

const { NextResponse, NextRequest } = await import('next/server')
const { proxy, admitsToEvent } = await import('@/proxy')

function request(url: string) {
  // NextRequest is constructible from a plain Request in the node runtime.
  return new NextRequest(new Request(url))
}

beforeEach(() => {
  updateSession.mockReset()
  updateSession.mockImplementation(() => NextResponse.next())
  validateAdmissionToken.mockReset()
  maybeSingle.mockReset()
  // Default: no event found, so the queue gate is a no-op unless a test says so.
  maybeSingle.mockResolvedValue({ data: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('decision 1: host canonicalisation', () => {
  it('301s a branded alias to the canonical host, preserving the path', async () => {
    const res = await proxy(request('https://eventlinqs.com/events/some-gig'))
    expect(res.status).toBe(301)
    const location = new URL(res.headers.get('location')!)
    expect(location.hostname).toBe('www.eventlinqs.com.au')
    expect(location.pathname).toBe('/events/some-gig')
  })

  it.each([
    'https://eventlinqs.com/',
    'https://www.eventlinqs.com/',
    'https://eventlinqs.com.au/',
  ])('redirects %s', async (url) => {
    const res = await proxy(request(url))
    expect(res.status).toBe(301)
  })

  it('never redirects localhost, a preview host, or the canonical host itself', async () => {
    // If this regressed, every preview deployment would bounce its own traffic at
    // production, and local development would be unusable.
    for (const url of [
      'http://localhost:3000/',
      'https://el-security-abc123.vercel.app/',
      'https://www.eventlinqs.com.au/',
    ]) {
      const res = await proxy(request(url))
      expect(res.status, `${url} must not be redirected`).not.toBe(301)
    }
  })

  it('exempts the Stripe webhook from canonicalisation', async () => {
    // Stripe does NOT follow redirects: a 3xx here silently breaks every webhook
    // delivery, which on this platform means tickets stop being granted.
    const res = await proxy(request('https://eventlinqs.com/api/webhooks/stripe'))
    expect(res.status).not.toBe(301)
  })
})

describe('decision 2: the /dev/* production gate', () => {
  it('404s in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    const res = await proxy(request('https://www.eventlinqs.com.au/dev/logo-preview'))
    expect(res.status).toBe(404)
  })

  it('404s on a Vercel production deploy', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    const res = await proxy(request('https://www.eventlinqs.com.au/dev/shell-preview'))
    expect(res.status).toBe(404)
  })

  it('allows preview deploys and local development, which is the point of it', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await proxy(request('https://x.vercel.app/dev/logo-preview'))).status).not.toBe(404)

    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', '')
    expect((await proxy(request('http://localhost:3000/dev/logo-preview'))).status).not.toBe(404)
  })

  it('gates the bare /dev path too, not only /dev/*', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    expect((await proxy(request('https://www.eventlinqs.com.au/dev'))).status).toBe(404)
  })
})

describe('decision 3: a queue token admits to ONE event, not every event', () => {
  it('accepts a token issued for the event being requested', () => {
    validateAdmissionToken.mockReturnValue({ valid: true, eventId: 'event-a' })
    expect(admitsToEvent('tok', 'event-a')).toBe(true)
  })

  it('REFUSES a validly signed token issued for a different event', () => {
    // The regression that matters. A signature proves issuance, never scope.
    validateAdmissionToken.mockReturnValue({ valid: true, eventId: 'quiet-event' })
    expect(
      admitsToEvent('tok', 'high-demand-event'),
      'a token for one event must not admit the bearer to another',
    ).toBe(false)
  })

  it('refuses an invalid signature even when the event matches', () => {
    validateAdmissionToken.mockReturnValue({ valid: false, eventId: 'event-a' })
    expect(admitsToEvent('tok', 'event-a')).toBe(false)
  })

  it('redirects a pre-admission visitor on a high-demand event to the queue', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'event-a', is_high_demand: true, status: 'published' },
    })
    const res = await proxy(request('https://www.eventlinqs.com.au/events/big-show'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/queue/big-show')
  })

  it('lets a correctly scoped token straight through to the event', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'event-a', is_high_demand: true, status: 'published' },
    })
    validateAdmissionToken.mockReturnValue({ valid: true, eventId: 'event-a' })
    const res = await proxy(
      request('https://www.eventlinqs.com.au/events/big-show?queue_token=tok'),
    )
    expect(res.status).not.toBe(307)
    expect(updateSession).toHaveBeenCalled()
  })

  it('sends a token scoped to another event back to the queue', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'event-a', is_high_demand: true, status: 'published' },
    })
    validateAdmissionToken.mockReturnValue({ valid: true, eventId: 'some-other-event' })
    const res = await proxy(
      request('https://www.eventlinqs.com.au/events/big-show?queue_token=tok'),
    )
    expect(res.status).toBe(307)
  })

  it('does not gate an event that is not high demand', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'event-a', is_high_demand: false, status: 'published' },
    })
    const res = await proxy(request('https://www.eventlinqs.com.au/events/small-gig'))
    expect(res.status).not.toBe(307)
  })
})

describe('decision 4: everything else delegates to session refresh', () => {
  it('calls updateSession for an ordinary request', async () => {
    await proxy(request('https://www.eventlinqs.com.au/dashboard'))
    expect(updateSession).toHaveBeenCalledTimes(1)
  })

  it('does NOT call updateSession when an earlier gate already answered', async () => {
    // Ordering matters: a redirect or a 404 must short-circuit before any cookie
    // is touched, or a blocked request still pays for a Supabase round trip.
    await proxy(request('https://eventlinqs.com/'))
    expect(updateSession).not.toHaveBeenCalled()
  })
})

describe('the matcher still excludes static assets', () => {
  it('skips _next/static, images and fonts', async () => {
    const { config } = await import('@/proxy')
    // ANCHORED. Next compiles a matcher as a full-path match; a bare
    // `new RegExp(pattern)` is unanchored, so the engine is free to start
    // matching past the negative lookahead and every exclusion appears to fail.
    // That is a bug in the test, not in the matcher, and it cost a red run to
    // notice.
    const re = new RegExp(`^${config.matcher[0]!}$`)
    for (const p of ['/_next/static/chunk.js', '/favicon.ico', '/hero/x.avif', '/a/b.woff2']) {
      expect(re.test(p), `${p} should not run the proxy`).toBe(false)
    }
    for (const p of ['/', '/events/x', '/api/webhooks/stripe']) {
      expect(re.test(p), `${p} should run the proxy`).toBe(true)
    }
  })
})
