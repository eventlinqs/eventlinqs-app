// THE LINK HEALS BEFORE ANYONE IS TOLD (the PM's 11:53 of 26 November 2026, item 2: "On a dead booking link the engine
// itself re-reads the source, sets the new link when the source gives one ... Its test: a night whose link dies is healed
// or taken down within one run, never left live with a dead link"). The case: The Greatest Christmas Show's booking page,
// .../the-greatest-christmas-show-2/, answered 404 and the sentinel emailed Lawal CRITICAL at 11:42, while the night's own
// newer listing from its source already named the moved page, .../the-greatest-christmas-show-3/, live and selling.
// Taken down within the same run is held by tests/unit/health/dead-link-hold.test.ts (the hold in one run).

import { describe, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))

import type { CheckDeps } from '@/lib/events/link-check'
import { healCandidates, runLinkCheck } from '@/lib/events/link-check-run'

const OLD = 'https://geelongartscentre.org.au/whats-on/all-events/the-greatest-christmas-show-2/'
const NEW = 'https://geelongartscentre.org.au/whats-on/all-events/the-greatest-christmas-show-3/'
const OLDER = 'https://geelongartscentre.org.au/whats-on/all-events/the-greatest-christmas-show/'
const onSale = `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Event', name: 'The Greatest Christmas Show', startDate: '2026-11-29T14:30:00+11:00', offers: { '@type': 'Offer', price: 49.9, priceCurrency: 'AUD', availability: 'https://schema.org/InStock' } })}</script></head></html>`

type Write = { id: string; row: Record<string, unknown> }

/** Enough of supabase-js for the run: the links of nights to come, a night's other links, its candidates, a link's update. */
function fakeAdmin(candidates: { page_url: string | null; found_at: string | null }[]) {
  const writes: Write[] = []
  const link = { id: 'l1', event_id: 'e1', url: OLD, availability: 'on_sale', price_from_cents: 4990, events: { start_date: '2026-11-29T03:30:00Z', timezone: 'Australia/Melbourne' } }
  const admin = {
    from: (table: string) => ({
      select: (cols: string) => {
        if (table === 'event_booking_links' && cols.startsWith('id, event_id')) return { gte: () => ({ limit: async () => ({ data: [link], error: null }) }) }
        if (table === 'event_booking_links') return { eq: async () => ({ data: [{ url: OLD }], error: null }) }
        return { eq: () => ({ not: () => ({ limit: async () => ({ data: candidates, error: null }) }) }) }
      },
      update: (row: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          const done = { error: null }
          const p = Promise.resolve(done) as Promise<typeof done> & { eq: () => Promise<typeof done> }
          writes.push({ id, row })
          p.eq = async () => done
          return p
        },
      }),
    }),
  } as unknown as SupabaseClient
  return { admin, writes }
}

const deps = (alive: ReadonlySet<string>): CheckDeps => ({
  async get(u) {
    if (u.endsWith('/robots.txt')) return { status: 404, body: '' }
    return alive.has(u) ? { status: 200, body: onSale } : { status: 404, body: 'gone' }
  },
})

describe('which pages a dead link may heal to', () => {
  test("the night's own source pages it does not carry, newest first, each once, web addresses only", () => {
    const tries = healCandidates(OLD, [OLD], [
      { page_url: OLDER, found_at: '2026-10-01T00:00:00Z' },
      { page_url: NEW, found_at: '2026-11-25T00:00:00Z' },
      { page_url: OLD, found_at: '2026-11-01T00:00:00Z' },
      { page_url: NEW, found_at: '2026-11-20T00:00:00Z' },
      { page_url: 'not a page', found_at: '2026-11-26T00:00:00Z' },
      { page_url: null, found_at: '2026-11-26T00:00:00Z' },
    ])
    expect(tries).toEqual([NEW, OLDER])
  })
})

describe('the run heals a dead link from its source, or writes it dead', () => {
  test('its moved page answers: the link becomes that page, on sale at its price, and nothing is written dead', async () => {
    const { admin, writes } = fakeAdmin([{ page_url: NEW, found_at: '2026-11-25T00:00:00Z' }])
    const summary = await runLinkCheck(admin, deps(new Set([NEW])), new Date('2026-11-26T00:00:00Z'))
    expect(summary.healed).toBe(1)
    expect(writes).toEqual([{ id: 'l1', row: expect.objectContaining({ url: NEW, availability: 'on_sale', price_from_cents: 4990 }) }])
    expect(writes.some((w) => w.row.availability === 'dead')).toBe(false)
  })

  test('no page of its source answers: the link is written dead as before, and the sentinel holds the night', async () => {
    const { admin, writes } = fakeAdmin([{ page_url: NEW, found_at: '2026-11-25T00:00:00Z' }])
    const summary = await runLinkCheck(admin, deps(new Set()), new Date('2026-11-26T00:00:00Z'))
    expect(summary.healed ?? 0).toBe(0)
    expect(writes).toEqual([{ id: 'l1', row: expect.objectContaining({ availability: 'dead' }) }])
  })
})
