import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { creditConversion, type ConversionDeps } from '@/lib/broadcast/conversion'

const PIECE = '11111111-1111-4111-8111-111111111111'
const order = { id: 'o-1', event_id: 'ev-1' }

function deps(over: Partial<ConversionDeps> = {}) {
  const recorded: { linkId: string; orderId: string; pieceId: string | null }[] = []
  const d: ConversionDeps = {
    resolve: async () => ({ id: 'share-link', event_id: 'ev-1' }),
    pieceNamesNight: async () => true,
    ownLinkFor: async () => ({ id: 'own-link' }),
    record: async (linkId, orderId, pieceId) => {
      recorded.push({ linkId, orderId, pieceId })
    },
    ...over,
  }
  return { d, recorded }
}

// D8: the order, the one verified sale, keeps the share link it always credited, and now also names the post that
// brought the buyer; a post alone credits the night's own link rather than losing the sale's source.
describe('crediting a confirmed order', () => {
  test('a share link and a post that named the night: both', async () => {
    const { d, recorded } = deps()
    await creditConversion(order, { shareCode: 'abc', pieceCookie: PIECE }, d)
    expect(recorded).toEqual([{ linkId: 'share-link', orderId: 'o-1', pieceId: PIECE }])
  })
  test('a post alone credits the night\'s own link', async () => {
    const { d, recorded } = deps()
    await creditConversion(order, { shareCode: null, pieceCookie: PIECE }, d)
    expect(recorded).toEqual([{ linkId: 'own-link', orderId: 'o-1', pieceId: PIECE }])
  })
  test('a share link for another night and no post: nothing, as before', async () => {
    const { d, recorded } = deps({ resolve: async () => ({ id: 'share-link', event_id: 'other' }) })
    await creditConversion(order, { shareCode: 'abc', pieceCookie: null }, d)
    expect(recorded).toEqual([])
  })
  test('a post that did not name the night claims nothing', async () => {
    const { d, recorded } = deps({ pieceNamesNight: async () => false })
    await creditConversion(order, { shareCode: null, pieceCookie: PIECE }, d)
    expect(recorded).toEqual([])
  })
  test('a failed read of the post keeps the share link credit', async () => {
    const { d, recorded } = deps({
      pieceNamesNight: async () => {
        throw new Error('read failed')
      },
    })
    await creditConversion(order, { shareCode: 'abc', pieceCookie: PIECE }, d)
    expect(recorded).toEqual([{ linkId: 'share-link', orderId: 'o-1', pieceId: null }])
  })
  test('no share link and no post: nothing', async () => {
    const { d, recorded } = deps()
    await creditConversion(order, { shareCode: null, pieceCookie: 'not-an-id' }, d)
    expect(recorded).toEqual([])
  })
})
