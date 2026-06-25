// Reserve-hold release cron proof.
//
// Drives the REAL cron route handler (src/app/api/cron/payout-holds-release/route.ts)
// which calls runReserveRelease -> release_holds()
// (supabase/migrations/20260531000003_m6_payout_disbursement.sql). The SQL side is
// additionally proven against live Oragniser rows in the verification note attached
// to the PR; here we pin the route contract:
//   1. CRON_SECRET auth gate (the same gate as reservation-expire).
//   2. JSON shape + released count passthrough.
//   3. RPC failure -> HTTP 500 (so a transient DB fault is visible, not a silent 200).

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  releaseCount: 0 as number,
  rpcError: false as boolean,
}))

function makeAdminMock() {
  return {
    rpc: vi.fn(async (name: string) => {
      if (name !== 'release_holds') return { data: null, error: null }
      if (h.rpcError) return { data: null, error: { message: 'boom' } }
      return { data: h.releaseCount, error: null }
    }),
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminMock() }))

import { GET } from '@/app/api/cron/payout-holds-release/route'

function makeReq(authHeader?: string): NextRequest {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === 'authorization' ? authHeader ?? null : null),
    },
  } as unknown as NextRequest
}

beforeEach(() => {
  h.releaseCount = 0
  h.rpcError = false
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'sekret'
})

describe('payout-holds-release cron: auth gate', () => {
  test('rejects when CRON_SECRET is set and Authorization is missing', async () => {
    process.env.CRON_SECRET = 'sekret'
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  test('rejects when CRON_SECRET is set and Authorization is wrong', async () => {
    process.env.CRON_SECRET = 'sekret'
    const res = await GET(makeReq('Bearer nope'))
    expect(res.status).toBe(401)
  })

  test('accepts when CRON_SECRET is set and Authorization matches', async () => {
    process.env.CRON_SECRET = 'sekret'
    const res = await GET(makeReq('Bearer sekret'))
    expect(res.status).toBe(200)
  })

  test('refuses (401) when CRON_SECRET is not configured (fail closed)', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeReq('Bearer sekret'))
    expect(res.status).toBe(401)
  })
})

describe('payout-holds-release cron: contract', () => {
  test('returns released count and JSON shape', async () => {
    h.releaseCount = 4
    const res = await GET(makeReq('Bearer sekret'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; released: number; timestamp: string }
    expect(body.ok).toBe(true)
    expect(body.released).toBe(4)
    expect(typeof body.timestamp).toBe('string')
  })

  test('surfaces RPC failure as 500', async () => {
    h.rpcError = true
    const res = await GET(makeReq('Bearer sekret'))
    expect(res.status).toBe(500)
  })
})
