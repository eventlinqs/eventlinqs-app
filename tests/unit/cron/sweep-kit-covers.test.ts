// The composer artwork sweep, driven for real.
//
// Anonymous drafts expire on their own after 30 days because Redis has a TTL.
// Supabase Storage has no equivalent, so without this the OBJECTS outlive the
// drafts that point at them forever and the storage bill has no ceiling.
//
// The 31-day boundary is the part worth testing rather than asserting: it is
// deliberately ONE DAY LONGER than the draft TTL so a draft that is still alive
// is never stripped of its artwork by a clock race between the two. Waiting 31
// days is not a test, so the handler is driven against a storage mock holding
// objects of known ages.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

type Obj = { name: string; updated_at?: string | null; created_at?: string | null }

const h = vi.hoisted(() => ({
  authDenied: null as Response | null,
  /** prefix -> objects inside it */
  tree: new Map<string, Obj[]>(),
  removed: [] as string[],
  listError: false,
}))

vi.mock('@/lib/cron/auth', () => ({
  requireCronAuth: vi.fn(() => h.authDenied),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: (_bucket: string) => ({
        list: async (path: string, _opts?: { limit?: number; offset?: number }) => {
          if (h.listError) return { data: null, error: { message: 'boom' } }
          if (path === '') {
            const prefixes = [...h.tree.keys()].map(name => ({ name }))
            // The handler pages by PAGE=100; everything here fits one page.
            return { data: _opts?.offset ? [] : prefixes, error: null }
          }
          return { data: h.tree.get(path) ?? [], error: null }
        },
        remove: async (paths: string[]) => {
          h.removed.push(...paths)
          return { error: null }
        },
      }),
    },
  }),
}))

const { GET } = await import('@/app/api/cron/sweep-kit-covers/route')

const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

function request(): NextRequest {
  return new Request('https://eventlinqs.com/api/cron/sweep-kit-covers') as unknown as NextRequest
}

beforeEach(() => {
  h.authDenied = null
  h.tree = new Map()
  h.removed = []
  h.listError = false
})

describe('the artwork sweep', () => {
  it('is fail-closed on the cron secret', async () => {
    h.authDenied = new Response(JSON.stringify({ ok: false }), { status: 401 })
    h.tree.set('oldcode12345', [{ name: 'cover.webp', updated_at: ago(90) }])

    const res = await GET(request())
    expect(res.status).toBe(401)
    // Nothing is deleted by an unauthenticated caller.
    expect(h.removed).toEqual([])
  })

  it('deletes artwork older than 31 days', async () => {
    h.tree.set('abandoned123', [{ name: 'cover.webp', updated_at: ago(45) }])

    const res = await GET(request())
    const json = (await res.json()) as { ok: boolean; scanned: number; deleted: number }
    expect(json.ok).toBe(true)
    expect(json.deleted).toBe(1)
    expect(h.removed).toEqual(['abandoned123/cover.webp'])
  })

  it('KEEPS artwork belonging to a draft that is still alive', async () => {
    // The whole reason the window is 31 and not 30. A draft on its last day
    // must not have its artwork pulled out from under it.
    h.tree.set('stillalive12', [{ name: 'cover.webp', updated_at: ago(29.9) }])

    const res = await GET(request())
    const json = (await res.json()) as { deleted: number; scanned: number }
    expect(json.scanned).toBe(1)
    expect(json.deleted).toBe(0)
    expect(h.removed).toEqual([])
  })

  it('keeps a fresh upload', async () => {
    h.tree.set('freshcode123', [{ name: 'cover.webp', updated_at: ago(0) }])
    const res = await GET(request())
    expect(((await res.json()) as { deleted: number }).deleted).toBe(0)
    expect(h.removed).toEqual([])
  })

  it('sweeps a mixed bucket, taking only what is past the window', async () => {
    h.tree.set('old1code1234', [{ name: 'cover.webp', updated_at: ago(60) }])
    h.tree.set('new1code1234', [{ name: 'cover.webp', updated_at: ago(5) }])
    h.tree.set('old2code1234', [{ name: 'cover.webp', updated_at: ago(32) }])

    const res = await GET(request())
    const json = (await res.json()) as { scanned: number; deleted: number }
    expect(json.scanned).toBe(3)
    expect(json.deleted).toBe(2)
    expect(h.removed.sort()).toEqual(['old1code1234/cover.webp', 'old2code1234/cover.webp'])
  })

  it('uses updated_at, so REPLACING artwork restarts its life', async () => {
    // The object is upserted in place on re-upload. An organiser who swapped
    // their photo yesterday on a draft created two months ago must keep it.
    h.tree.set('swapped12345', [{ name: 'cover.webp', created_at: ago(60), updated_at: ago(1) }])

    const res = await GET(request())
    expect(((await res.json()) as { deleted: number }).deleted).toBe(0)
  })

  it('reports a listing failure rather than claiming a clean sweep', async () => {
    h.listError = true
    const res = await GET(request())
    expect(res.status).toBe(502)
  })
})
