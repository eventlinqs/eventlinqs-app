import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AUTH-01 proof.
 *
 * The route-protection gate lives in `updateSession` (src/lib/supabase/
 * middleware.ts) and only runs if the route-middleware ENTRY file exports it.
 * In Next.js 16 that entry is `src/proxy.ts` (the framework renamed
 * `middleware.ts` -> `proxy.ts`); it wires `updateSession` in with a matcher,
 * so protection already runs. This test proves two things:
 *   1. The proxy entry exists and wires `updateSession` in with a matcher.
 *   2. The gate itself redirects an UNAUTHENTICATED request for a protected
 *      route to /login, lets public routes through, and bounces an
 *      authenticated user off the auth pages.
 */

// Mutable auth result the mocked Supabase client returns.
let mockUser: { id: string } | null = null

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser }, error: null }),
    },
  }),
}))

import { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const ROOT = process.cwd()

function req(path: string): NextRequest {
  return new NextRequest(new URL(`https://www.eventlinqs.com${path}`))
}

describe('AUTH-01: route-middleware entry file', () => {
  it('the Next 16 proxy entry exists and wires updateSession with a matcher', () => {
    // Next 16 uses src/proxy.ts as the route-middleware entry. A stray
    // src/middleware.ts must NOT coexist (the build rejects both).
    expect(existsSync(join(ROOT, 'src', 'middleware.ts'))).toBe(false)
    const file = join(ROOT, 'src', 'proxy.ts')
    expect(existsSync(file), 'src/proxy.ts must exist for route middleware to run').toBe(true)
    const src = readFileSync(file, 'utf8')
    expect(src).toContain('updateSession')
    expect(src).toMatch(/export\s+(async\s+)?function\s+proxy/)
    expect(src).toMatch(/export\s+const\s+config/)
    expect(src).toContain('matcher')
  })
})

describe('AUTH-01: protected-route gate (updateSession)', () => {
  beforeEach(() => {
    mockUser = null
  })

  it('redirects an unauthenticated request for /dashboard to /login', async () => {
    mockUser = null
    const res = await updateSession(req('/dashboard'))
    expect(res.status).toBe(307)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/login')
    expect(location).toContain('redirect=%2Fdashboard')
  })

  it('redirects an unauthenticated request for a nested /dashboard/* route', async () => {
    mockUser = null
    const res = await updateSession(req('/dashboard/payouts'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location') ?? '').toContain('/login')
  })

  it('lets an unauthenticated request through to a PUBLIC route', async () => {
    mockUser = null
    const res = await updateSession(req('/events'))
    // No redirect: a plain NextResponse.next() carries no location header.
    expect(res.headers.get('location')).toBeNull()
  })

  it('bounces an authenticated user away from /login', async () => {
    mockUser = { id: 'user-1' }
    const res = await updateSession(req('/login'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location') ?? '').toContain('/dashboard')
  })

  it('lets an authenticated user reach /dashboard', async () => {
    mockUser = { id: 'user-1' }
    const res = await updateSession(req('/dashboard'))
    expect(res.headers.get('location')).toBeNull()
  })
})
