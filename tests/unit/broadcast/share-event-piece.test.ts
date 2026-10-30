import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed when a client is injected')
  },
}))

import { recordShareLinkEvent, type BroadcastClient } from '@/lib/broadcast/share-links'

function capture() {
  const rows: Record<string, unknown>[] = []
  const client = {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        rows.push(row)
        return { error: null }
      },
    }),
  } as unknown as BroadcastClient
  return { client, rows }
}

// PostgREST refuses an insert that names a column it does not know. Were this code to reach a database before its
// migration, naming piece_id on every row would lose every click and press, so it is named only when there is a piece.
describe('an event row and the post that brought it', () => {
  test('names the piece when one is credited', async () => {
    const { client, rows } = capture()
    await recordShareLinkEvent({ linkId: 'l', kind: 'conversion', orderId: 'o', pieceId: 'p-1' }, { client })
    expect(rows[0].piece_id).toBe('p-1')
  })
  test('leaves the column out entirely when none is', async () => {
    const { client, rows } = capture()
    await recordShareLinkEvent({ linkId: 'l', kind: 'conversion', orderId: 'o' }, { client })
    await recordShareLinkEvent({ linkId: 'l', kind: 'conversion', orderId: 'o', pieceId: null }, { client })
    expect(rows.map((r) => 'piece_id' in r)).toEqual([false, false])
  })
})
