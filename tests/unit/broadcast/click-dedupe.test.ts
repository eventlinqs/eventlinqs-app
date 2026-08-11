// Clicks are counted the same way views are.
//
// THE DEFECT. Views were de-duplicated per (link, visitor, day) and clicks
// were not, so the organiser's reach panel showed two numbers produced by two
// different rules and invited a comparison neither could support. Production
// reads 57 clicks against 3 views. Measured on TEST, 32 click rows came from
// only 24 distinct (link, visitor) pairs.
//
// These tests fail against the previous implementation, whose dedupe branch
// was `if (input.kind === 'view' && ...)`: the duplicate click was inserted.

import { describe, expect, test, vi } from 'vitest'

// The admin client must never be constructed when one is injected.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed when a client is injected')
  },
}))

import {
  recordShareLinkEvent,
  type BroadcastClient,
} from '@/lib/broadcast/share-links'

/**
 * A client that reports whether a same-day row already exists, and records
 * whether an insert was attempted.
 */
function clientWithExisting(existing: boolean) {
  const state = { inserted: false, insertedKind: null as string | null, lookedUpKind: null as string | null }
  const client = {
    from: () => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          eq: (_col2: string, kind: string) => {
            state.lookedUpKind = kind
            return {
              eq: () => ({
                gte: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: existing ? { id: 'existing-row' } : null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }
          },
        }),
      }),
      insert: async (row: { kind: string }) => {
        state.inserted = true
        state.insertedKind = row.kind
        return { error: null }
      },
    }),
  } as unknown as BroadcastClient
  return { client, state }
}

describe('click de-duplication', () => {
  test('a same-day repeat click by the same visitor writes no second row', async () => {
    const { client, state } = clientWithExisting(true)
    const ok = await recordShareLinkEvent(
      { linkId: 'link-1', kind: 'click', visitorHash: 'visitor-abc' },
      { client },
    )
    expect(ok).toBe(true)
    expect(state.inserted).toBe(false)
  })

  test('a first click by a visitor is still recorded', async () => {
    const { client, state } = clientWithExisting(false)
    const ok = await recordShareLinkEvent(
      { linkId: 'link-1', kind: 'click', visitorHash: 'visitor-abc' },
      { client },
    )
    expect(ok).toBe(true)
    expect(state.inserted).toBe(true)
    expect(state.insertedKind).toBe('click')
  })

  test('the dedupe checks the same kind it is recording, never the other one', async () => {
    // A dedupe that always looked for 'view' would swallow the first click of
    // any visitor who had already viewed, losing real clicks.
    const { client, state } = clientWithExisting(false)
    await recordShareLinkEvent(
      { linkId: 'link-1', kind: 'click', visitorHash: 'visitor-abc' },
      { client },
    )
    expect(state.lookedUpKind).toBe('click')
  })

  test('views are still deduped, unchanged', async () => {
    const { client, state } = clientWithExisting(true)
    await recordShareLinkEvent(
      { linkId: 'link-1', kind: 'view', visitorHash: 'visitor-abc' },
      { client },
    )
    expect(state.inserted).toBe(false)
    expect(state.lookedUpKind).toBe('view')
  })

  test('a click with no visitor hash is recorded rather than dropped', async () => {
    // Without a hash there is nothing to dedupe on. Losing the row would
    // under-count real traffic, which is the opposite failure.
    const { client, state } = clientWithExisting(true)
    const ok = await recordShareLinkEvent({ linkId: 'link-1', kind: 'click' }, { client })
    expect(ok).toBe(true)
    expect(state.inserted).toBe(true)
  })

  test('conversions are never deduped by visitor, only by the unique index', async () => {
    // Two genuine orders from one buyer are two conversions.
    const { client, state } = clientWithExisting(true)
    await recordShareLinkEvent(
      { linkId: 'link-1', kind: 'conversion', orderId: 'order-9', visitorHash: 'visitor-abc' },
      { client },
    )
    expect(state.inserted).toBe(true)
  })
})
