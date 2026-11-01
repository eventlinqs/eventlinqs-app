import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * readActivationFacts reads with the service role, so it must prove the viewer may act for the organisation itself,
 * and it must read an organiser's lists whole: Supabase answers an unbounded select with at most 1,000 rows and no
 * error. The fake client below keeps that ceiling, so a read without a range loses the rows past it, as on a real
 * project.
 */
const act = vi.hoisted(() => ({ ok: true }))
vi.mock('@/lib/organisations/act-for', () => ({
  assertCallerMayActForOrganisation: vi.fn(async (_user: string, organisationId: string) =>
    act.ok ? { ok: true, organisationId, via: 'owner' } : { ok: false, reason: 'not_your_organisation' },
  ),
}))

import { readActivationFacts } from '@/lib/growth/activation-read'

const CEILING = 1000
type Row = Record<string, unknown>

function fakeClient(tables: Record<string, Row[]>) {
  const from = vi.fn((table: string) => {
    let range: [number, number] | null = null
    let single = false
    const rows = () => tables[table] ?? []
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'gt', 'not', 'order', 'limit']) builder[m] = () => builder
    builder.range = (a: number, b: number) => {
      range = [a, b]
      return builder
    }
    builder.maybeSingle = () => {
      single = true
      return builder
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
      if (single) return Promise.resolve({ data: rows()[0] ?? null, error: null }).then(resolve)
      const [a, b] = range ?? [0, CEILING - 1]
      return Promise.resolve({ data: rows().slice(a, Math.min(b + 1, a + CEILING)), error: null }).then(resolve)
    }
    return builder
  })
  return { client: { from } as unknown as SupabaseClient, from }
}

const ORG = { id: 'org-1', owner_id: 'user-1', created_at: '2026-10-01T00:00:00Z', stripe_status_verified_at: null }
const night = (i: number, extra: Partial<Row> = {}) => ({
  id: `night-${String(i).padStart(5, '0')}`,
  status: 'draft',
  published_at: null,
  end_date: '2026-12-01T00:00:00Z',
  external_ticket_url: null,
  ticket_tiers: [],
  ...extra,
})

describe('readActivationFacts', () => {
  beforeEach(() => {
    act.ok = true
  })

  it('refuses a viewer who may not act for the organisation, before reading any row', async () => {
    act.ok = false
    const { client, from } = fakeClient({ organisations: [ORG] })
    await expect(readActivationFacts(client, 'org-1', 'stranger', new Date('2026-11-01T00:00:00Z'))).rejects.toThrow(
      /not your organisation/,
    )
    expect(from).not.toHaveBeenCalled()
  })

  it('reads every upcoming night, so a ticketed night past the first thousand still counts', async () => {
    const nights = Array.from({ length: 1500 }, (_, i) =>
      i === 1200
        ? night(i, {
            status: 'published',
            published_at: '2026-10-20T00:00:00Z',
            ticket_tiers: [{ price: 2500, is_active: true, created_at: '2026-10-19T00:00:00Z' }],
          })
        : night(i),
    )
    const { client } = fakeClient({ organisations: [ORG], events: nights, listing_claims: [], orders: [] })
    const facts = await readActivationFacts(client, 'org-1', 'user-1', new Date('2026-11-01T00:00:00Z'))
    expect(facts.ticketsAt).toBe('2026-10-19T00:00:00Z')
    expect(facts.publishedAt).toBe('2026-10-20T00:00:00Z')
  })

  it('reads every claim, so a verified claim past the first thousand still counts', async () => {
    const claims = Array.from({ length: 1100 }, (_, i) =>
      i === 1050 ? { status: 'verified', verified_at: '2026-10-05T00:00:00Z' } : { status: 'rejected', verified_at: null },
    )
    const { client } = fakeClient({ organisations: [ORG], events: [], listing_claims: claims, orders: [] })
    const facts = await readActivationFacts(client, 'org-1', 'user-1', new Date('2026-11-01T00:00:00Z'))
    expect(facts.cameByClaim).toBe(true)
    expect(facts.claimVerifiedAt).toBe('2026-10-05T00:00:00Z')
  })
})
