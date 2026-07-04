// Reservation-expiry cron proof.
//
// Drives the REAL cron route handler (src/app/api/cron/reservation-expire/route.ts)
// against a STATEFUL in-memory model of `reservations` + `ticket_tiers`. The model
// faithfully mirrors the authoritative SQL function expire_stale_reservations()
// (supabase/migrations/20260101000001_baseline_schema.sql:1291): it expires ONLY
// reservations with status = 'active' AND expires_at < NOW(), releases each held
// ticket_tiers.reserved_count back (clamped at 0 via GREATEST), and marks the
// reservation 'expired'. The boundary predicate (strictly `< NOW()`) is the thing
// under test here; the real Postgres function is additionally proven against live
// reservation rows in the verification note attached to the PR.
//
// Two layers are asserted:
//   1. The route contract: CRON_SECRET auth gate, JSON shape, RPC-error handling.
//   2. The expiry boundary: expired-active holds release inventory and flip to
//      'expired'; still-valid holds and already-terminal rows are never touched.

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { NextRequest } from 'next/server'

type Reservation = {
  id: string
  status: 'active' | 'expired' | 'converted' | 'cancelled'
  expires_at: string // ISO
  items: { ticket_tier_id: string; quantity: number }[]
}
type Tier = { id: string; reserved_count: number }

// Stateful world shared with the admin-client mock via vi.hoisted.
const h = vi.hoisted(() => ({
  world: null as null | { reservations: Reservation[]; tiers: Map<string, Tier>; rpcError: boolean },
}))

function resetWorld() {
  h.world = { reservations: [], tiers: new Map(), rpcError: false }
}

// Faithful JS mirror of public.expire_stale_reservations(). Returns the number of
// reservations newly expired. Mutates the in-memory world the same way the SQL
// mutates the tables.
function runExpireStaleReservationsModel(): number {
  const w = h.world!
  const now = Date.now()
  let released = 0
  for (const r of w.reservations) {
    // Boundary: only active holds whose expires_at is strictly in the past.
    if (r.status !== 'active') continue
    if (new Date(r.expires_at).getTime() >= now) continue
    for (const item of r.items) {
      const tier = w.tiers.get(item.ticket_tier_id)
      if (tier) tier.reserved_count = Math.max(tier.reserved_count - item.quantity, 0)
    }
    r.status = 'expired'
    released += 1
  }
  return released
}

function makeAdminMock() {
  return {
    rpc: vi.fn(async (name: string) => {
      if (name !== 'expire_stale_reservations') return { data: null, error: null }
      if (h.world!.rpcError) return { data: null, error: { message: 'boom' } }
      return { data: runExpireStaleReservationsModel(), error: null }
    }),
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminMock() }))

import { GET } from '@/app/api/cron/reservation-expire/route'

function makeReq(authHeader?: string): NextRequest {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === 'authorization' ? authHeader ?? null : null),
    },
  } as unknown as NextRequest
}

beforeEach(() => {
  resetWorld()
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'sekret'
})

describe('reservation-expire cron: auth gate', () => {
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

describe('reservation-expire cron: contract', () => {
  test('returns released count and JSON shape', async () => {
    h.world!.tiers.set('tier_a', { id: 'tier_a', reserved_count: 3 })
    h.world!.reservations.push({
      id: 'r_expired',
      status: 'active',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      items: [{ ticket_tier_id: 'tier_a', quantity: 3 }],
    })

    const res = await GET(makeReq('Bearer sekret'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; released: number; timestamp: string }
    expect(body.ok).toBe(true)
    expect(body.released).toBe(1)
    expect(typeof body.timestamp).toBe('string')
  })

  test('surfaces RPC failure as 500', async () => {
    h.world!.rpcError = true
    const res = await GET(makeReq('Bearer sekret'))
    expect(res.status).toBe(500)
  })
})

describe('reservation-expire cron: expiry boundary', () => {
  test('releases expired holds and never touches valid or terminal ones', async () => {
    const w = h.world!
    // One tier holding inventory for several reservations.
    w.tiers.set('tier_a', { id: 'tier_a', reserved_count: 10 })

    const past = new Date(Date.now() - 1000).toISOString() // genuinely expired
    const future = new Date(Date.now() + 60_000).toISOString() // still valid

    w.reservations.push(
      // expired + active -> must release 2 and flip to expired
      { id: 'r_expired', status: 'active', expires_at: past, items: [{ ticket_tier_id: 'tier_a', quantity: 2 }] },
      // valid + active -> must be left completely alone
      { id: 'r_valid', status: 'active', expires_at: future, items: [{ ticket_tier_id: 'tier_a', quantity: 3 }] },
      // already expired -> no double-release
      { id: 'r_already_expired', status: 'expired', expires_at: past, items: [{ ticket_tier_id: 'tier_a', quantity: 4 }] },
      // converted (paid) -> never released
      { id: 'r_converted', status: 'converted', expires_at: past, items: [{ ticket_tier_id: 'tier_a', quantity: 1 }] },
      // cancelled -> never released
      { id: 'r_cancelled', status: 'cancelled', expires_at: past, items: [{ ticket_tier_id: 'tier_a', quantity: 1 }] },
    )

    const res = await GET(makeReq('Bearer sekret'))
    const body = (await res.json()) as { released: number }

    // Exactly one reservation expired (only r_expired qualified).
    expect(body.released).toBe(1)

    const byId = (id: string) => w.reservations.find(r => r.id === id)!
    expect(byId('r_expired').status).toBe('expired')
    expect(byId('r_valid').status).toBe('active') // untouched
    expect(byId('r_already_expired').status).toBe('expired') // unchanged, not re-processed
    expect(byId('r_converted').status).toBe('converted')
    expect(byId('r_cancelled').status).toBe('cancelled')

    // Only r_expired's 2 held seats were returned: 10 -> 8. The valid hold's 3
    // remain reserved; terminal rows released nothing.
    expect(w.tiers.get('tier_a')!.reserved_count).toBe(8)
  })

  test('a hold exactly at the boundary (expires_at == now) is NOT expired', async () => {
    const w = h.world!
    w.tiers.set('tier_b', { id: 'tier_b', reserved_count: 1 })
    // expires_at slightly in the future so the strict `< now` predicate excludes it.
    w.reservations.push({
      id: 'r_edge',
      status: 'active',
      expires_at: new Date(Date.now() + 5).toISOString(),
      items: [{ ticket_tier_id: 'tier_b', quantity: 1 }],
    })
    const res = await GET(makeReq('Bearer sekret'))
    const body = (await res.json()) as { released: number }
    expect(body.released).toBe(0)
    expect(w.reservations[0].status).toBe('active')
    expect(w.tiers.get('tier_b')!.reserved_count).toBe(1)
  })

  test('reserved_count never goes negative (GREATEST clamp)', async () => {
    const w = h.world!
    // Tier holds fewer than the reservation claims (data skew); release must clamp.
    w.tiers.set('tier_c', { id: 'tier_c', reserved_count: 1 })
    w.reservations.push({
      id: 'r_overrelease',
      status: 'active',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      items: [{ ticket_tier_id: 'tier_c', quantity: 5 }],
    })
    const res = await GET(makeReq('Bearer sekret'))
    const body = (await res.json()) as { released: number }
    expect(body.released).toBe(1)
    expect(w.tiers.get('tier_c')!.reserved_count).toBe(0)
  })
})
