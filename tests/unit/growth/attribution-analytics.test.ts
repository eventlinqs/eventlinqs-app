import { describe, it, expect } from 'vitest'
import { summariseAttribution } from '@/lib/growth/attribution-analytics'

describe('summariseAttribution', () => {
  const rows = [
    { metadata: { attribution: { source: 'share-a-ticket', referredBy: 'u1', event: 'afrobeats-night' } } },
    { metadata: { attribution: { source: 'share-a-ticket', referredBy: 'u1', event: 'afrobeats-night' } } },
    { metadata: { attribution: { source: 'share-a-ticket', referredBy: 'u2', event: 'jazz-club' } } },
    { metadata: { attribution: { source: 'organiser-invite', referredBy: null, event: null } } },
    { metadata: {} }, // organic
    { metadata: null }, // organic
  ]

  it('counts sources, attributed vs organic', () => {
    const s = summariseAttribution(rows)
    expect(s.total).toBe(6)
    expect(s.bySource['share-a-ticket']).toBe(3)
    expect(s.bySource['organiser-invite']).toBe(1)
    expect(s.organic).toBe(2)
    expect(s.attributed).toBe(4)
  })

  it('ranks referrers and events by signups driven', () => {
    const s = summariseAttribution(rows)
    expect(s.topReferrers[0]).toEqual({ referredBy: 'u1', signups: 2 })
    expect(s.topReferrers[1]).toEqual({ referredBy: 'u2', signups: 1 })
    expect(s.topEvents[0]).toEqual({ event: 'afrobeats-night', signups: 2 })
  })

  it('treats a tampered source as organic and never throws', () => {
    const s = summariseAttribution([{ metadata: { attribution: { source: 'evil' } } }])
    expect(s.bySource.organic).toBe(1)
  })

  it('handles an empty set', () => {
    const s = summariseAttribution([])
    expect(s).toMatchObject({ total: 0, attributed: 0, organic: 0 })
    expect(s.topReferrers).toEqual([])
  })
})
