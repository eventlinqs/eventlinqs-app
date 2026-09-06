import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE SIGNED-IN MARKER (close-out C13): the one cookie the routing layer can
 * see before a function runs, so the public edge cache rule for /events/:slug
 * excludes signed-in viewers and an archived event's holder page is never
 * shared with strangers. Three halves, pinned together here:
 *
 *   1. the session middleware sets it on a response with a user and clears it
 *      on a response without one, and touches nothing otherwise
 *   2. next.config.ts applies the public CDN header only when it is MISSING
 *   3. the archived view refuses a request that does not carry it
 */
const getUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/supabase/env', () => ({
  getSupabaseUrl: () => 'https://test.supabase.co',
  getSupabaseAnonKey: () => 'anon-key',
}))

const { NextRequest } = await import('next/server')
const { updateSession } = await import('@/lib/supabase/middleware')
const { SIGNED_IN_MARKER_COOKIE } = await import('@/lib/auth/signed-in-marker')

function request(url: string, cookie?: string) {
  const headers = cookie ? { cookie } : undefined
  return new NextRequest(new Request(url, { headers }))
}

beforeEach(() => {
  getUser.mockReset()
})

describe('the session middleware keeps the marker in step with the session', () => {
  it('sets it on a response with a user when the request lacks it', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await updateSession(request('https://www.eventlinqs.com.au/events/some-gig'))
    const cookie = res.cookies.get(SIGNED_IN_MARKER_COOKIE)
    expect(cookie?.value).toBe('1')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.secure).toBe(true)
    expect(cookie?.path).toBe('/')
  })

  it('leaves the response untouched when the marker already matches the session, so anonymous responses stay cacheable', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const anon = await updateSession(request('https://www.eventlinqs.com.au/events/some-gig'))
    expect(anon.cookies.get(SIGNED_IN_MARKER_COOKIE)).toBeUndefined()

    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const signedIn = await updateSession(request('https://www.eventlinqs.com.au/events/some-gig', `${SIGNED_IN_MARKER_COOKIE}=1`))
    expect(signedIn.cookies.get(SIGNED_IN_MARKER_COOKIE)).toBeUndefined()
  })

  it('clears it on a response without a user when the request still carries it', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await updateSession(request('https://www.eventlinqs.com.au/events/some-gig', `${SIGNED_IN_MARKER_COOKIE}=1`))
    const cookie = res.cookies.get(SIGNED_IN_MARKER_COOKIE)
    expect(cookie?.value).toBe('')
    expect(cookie?.maxAge).toBe(0)
  })

  it('sets it on the redirect away from the login page too, so the first page after sign-in carries it', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await updateSession(request('https://www.eventlinqs.com.au/login'))
    expect(res.status).toBe(307)
    expect(res.cookies.get(SIGNED_IN_MARKER_COOKIE)?.value).toBe('1')
  })

  it('never touches the Stripe webhook', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await updateSession(request('https://www.eventlinqs.com.au/api/webhooks/stripe'))
    expect(res.cookies.get(SIGNED_IN_MARKER_COOKIE)).toBeUndefined()
    expect(getUser).not.toHaveBeenCalled()
  })
})

describe('the edge cache rule and the archived view agree on the marker', () => {
  const root = join(__dirname, '..', '..', '..')

  it("next.config.ts applies the public CDN header to /events/:slug only when the marker is missing", () => {
    const src = readFileSync(join(root, 'next.config.ts'), 'utf8')
    const rule = src.slice(src.indexOf("source: '/events/:slug'"))
    const block = rule.slice(0, rule.indexOf('},') + 2)
    expect(block).toContain(`missing: [{ type: 'cookie', key: '${SIGNED_IN_MARKER_COOKIE}' }]`)
    expect(block).toContain('CDN-Cache-Control')
  })

  it('the archived view refuses a request without the marker before it reads the session', () => {
    const src = readFileSync(join(root, 'src', 'lib', 'events', 'archived-view.ts'), 'utf8')
    const marker = src.indexOf('jar.has(SIGNED_IN_MARKER_COOKIE)')
    const session = src.indexOf('supabase.auth.getUser()')
    expect(marker).toBeGreaterThan(0)
    expect(session).toBeGreaterThan(marker)
  })
})
