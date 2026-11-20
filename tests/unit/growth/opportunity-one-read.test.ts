import { beforeEach, describe, expect, it, vi } from 'vitest'

// THE OPPORTUNITY SCORE READS ITS NUMBERS IN ONE CALL (law 41, the speed train of 20 November 2026; /admin/opportunity
// took 11.9 s). readOpportunity asks growth_opportunity_raw once, with the 14 day window and the platform's one
// definition of a sale, and scores what it answers; a failed or malformed answer is refused, never read as zeros.

let answer: { data: unknown; error: { message: string } | null } = { data: [], error: null }
const calls: { name: string; args: Record<string, unknown> }[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return answer
    },
    from: (table: string) => {
      throw new Error(`readOpportunity read the table ${table} itself`)
    },
  }),
}))

import { opportunityRowsFrom, readOpportunity } from '@/lib/growth/opportunity'
import { SOLD_STATUSES } from '@/lib/broadcast/sales-attribution'

const NOW = new Date('2026-11-20T08:00:00Z')
const row = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: 'Harbour Lights Festival',
  slug: 'harbour-lights-festival',
  city_primary: 'geelong',
  category_id: 'c1',
  published_at: '2026-11-01T00:00:00+00:00',
  end_date: '2026-12-01T00:00:00+00:00',
  attention: 12,
  engaged: 3,
  conversion: 2,
  health: 150,
  ...over,
})

beforeEach(() => {
  calls.length = 0
  answer = { data: [], error: null }
})

describe('readOpportunity, one read', () => {
  it('asks growth_opportunity_raw once, over the 14 days to now, with the one definition of a sale, and reads no table', async () => {
    answer = { data: [row()], error: null }
    const out = await readOpportunity(NOW)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('growth_opportunity_raw')
    expect(calls[0].args).toEqual({ p_from: '2026-11-06T08:00:00.000Z', p_now: NOW.toISOString(), p_sold: [...SOLD_STATUSES] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'e1', title: 'Harbour Lights Festival', slug: 'harbour-lights-festival', city: 'geelong', category: 'c1' })
  })

  it("passes each figure through to the score: relevance from its own days, the rest as the database counted them", async () => {
    answer = { data: [row()], error: null }
    const [e] = await readOpportunity(NOW)
    // Published 19 days before NOW, so it is old enough to score (opportunity-math.ts's own rule).
    expect(e.state).toBe('scored')
    if (e.state !== 'scored') throw new Error('not scored')
    expect(e.raw).toEqual({ relevance: 14, attention: 12, engagement: 3, conversion: 2, health: 150 })
  })

  it('a failed read is said, never an empty board', async () => {
    answer = { data: null, error: { message: 'connection reset' } }
    await expect(readOpportunity(NOW)).rejects.toThrow(/the opportunity figures could not be read: connection reset/)
  })

  it('a malformed answer is refused, never read as zeros', () => {
    expect(() => opportunityRowsFrom({})).toThrow(/answered no list/)
    expect(() => opportunityRowsFrom([row({ attention: null })])).toThrow(/not a count/)
    expect(() => opportunityRowsFrom([row({ health: -1 })])).toThrow(/not a count/)
    expect(() => opportunityRowsFrom([row({ id: 7 })])).toThrow(/not an event/)
    expect(opportunityRowsFrom([row({ city_primary: null, published_at: null })])).toHaveLength(1)
  })
})
