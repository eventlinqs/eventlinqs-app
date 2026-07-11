// Broadcast flag resolver proof.
//
// The invariants under test:
//   1. The DB row is the source of truth: enabled=true in the table wins
//      over the OFF launch default, and vice versa.
//   2. Fail to launch defaults: an unreadable table can never switch a
//      stage ON early (digest, follow, artists resolve OFF) and never
//      kills the launch stage (share resolves ON).
//   3. The seeded defaults match SPEC section 6 exactly.

import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed when a client is injected')
  },
}))
vi.mock('@/lib/redis/client', () => ({
  getRedisClient: () => null,
}))

import {
  BROADCAST_FLAGS,
  BROADCAST_FLAG_DEFAULTS,
  isBroadcastFlag,
  isFeatureEnabled,
  type FlagReadClient,
} from '@/lib/flags/broadcast'

function clientReturning(row: { flag: string; enabled: boolean } | null, error?: string) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: error ? { message: error } : null }),
        }),
      }),
    }),
  } as unknown as FlagReadClient
}

describe('broadcast flag resolver', () => {
  test('seeded defaults match SPEC section 6 plus the marketplace stages', () => {
    expect(BROADCAST_FLAG_DEFAULTS).toEqual({
      broadcast_share: true,
      broadcast_digest: false,
      broadcast_follow: false,
      broadcast_artists: false,
      // Performer marketplace stages ship built but OFF by default.
      gig_board: false,
      artist_showcase: false,
    })
    expect(BROADCAST_FLAGS).toHaveLength(6)
  })

  test('DB row wins over the default in both directions', async () => {
    const onClient = clientReturning({ flag: 'broadcast_digest', enabled: true })
    expect(await isFeatureEnabled('broadcast_digest', { client: onClient })).toBe(true)

    const offClient = clientReturning({ flag: 'broadcast_share', enabled: false })
    expect(await isFeatureEnabled('broadcast_share', { client: offClient })).toBe(false)
  })

  test('a missing row resolves to the launch default', async () => {
    const empty = clientReturning(null)
    expect(await isFeatureEnabled('broadcast_share', { client: empty })).toBe(true)
    expect(await isFeatureEnabled('broadcast_artists', { client: empty })).toBe(false)
  })

  test('a DB error fails to launch defaults, never ON for an OFF stage', async () => {
    const broken = clientReturning(null, 'connection refused')
    expect(await isFeatureEnabled('broadcast_digest', { client: broken })).toBe(false)
    expect(await isFeatureEnabled('broadcast_follow', { client: broken })).toBe(false)
    expect(await isFeatureEnabled('broadcast_artists', { client: broken })).toBe(false)
    expect(await isFeatureEnabled('broadcast_share', { client: broken })).toBe(true)
  })

  test('isBroadcastFlag narrows correctly', () => {
    expect(isBroadcastFlag('broadcast_share')).toBe(true)
    expect(isBroadcastFlag('broadcast_qr')).toBe(false)
    expect(isBroadcastFlag('')).toBe(false)
  })
})
