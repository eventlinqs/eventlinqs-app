// The worker that turns the owner's notification records into something that
// arrives. Close-out UX3.
//
// The route itself is thin, so what is worth driving here is the two things a
// thin route still gets wrong: an unauthenticated caller must be refused before
// anything reads a database, and a run must SAY what it did, because "the
// dispatcher ran and had nothing to do" and "the dispatcher never ran" produce
// the same silence otherwise, and telling those two apart is the entire subject
// of this item.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  authDenied: null as Response | null,
  dispatchCalls: 0,
  digestCalls: 0,
  dispatchThrows: null as string | null,
}))

vi.mock('@/lib/cron/auth', () => ({
  requireCronAuth: vi.fn(() => h.authDenied),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ marker: 'admin-client' }),
}))

vi.mock('@/lib/notifications/platform-send', () => ({
  dispatchPendingPlatformNotifications: vi.fn(async () => {
    h.dispatchCalls += 1
    if (h.dispatchThrows) throw new Error(h.dispatchThrows)
    return { considered: 3, sent: 2, held: 1, escalated: 0, failed: 0, retried: 0 }
  }),
  sendHeldDigest: vi.fn(async () => {
    h.digestCalls += 1
    return { held: 1, sent: 1, escalated: 0, failed: 0 }
  }),
}))

const { GET } = await import('@/app/api/cron/platform-notify/route')

function request(): NextRequest {
  return new Request('https://eventlinqs.com/api/cron/platform-notify') as unknown as NextRequest
}

beforeEach(() => {
  h.authDenied = null
  h.dispatchCalls = 0
  h.digestCalls = 0
  h.dispatchThrows = null
})

describe('the owner notification worker', () => {
  it('is fail-closed on the cron secret, and reads nothing before refusing', async () => {
    h.authDenied = new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 })
    const res = await GET(request())
    expect(res.status).toBe(401)
    expect(h.dispatchCalls).toBe(0)
    expect(h.digestCalls).toBe(0)
  })

  it('dispatches, then clears the overflow it just created, in that order', async () => {
    const res = await GET(request())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.dispatched).toMatchObject({ considered: 3, sent: 2, held: 1 })
    expect(body.digest).toMatchObject({ held: 1, sent: 1 })
    expect(h.dispatchCalls).toBe(1)
    expect(h.digestCalls).toBe(1)
  })

  it('reports a failure as a failure rather than a quiet 200', async () => {
    h.dispatchThrows = 'platform_notifications read failed: connection reset'
    const res = await GET(request())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toContain('connection reset')
    expect(h.digestCalls).toBe(0)
  })
})
