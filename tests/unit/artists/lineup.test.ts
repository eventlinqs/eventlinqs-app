import { describe, expect, test } from 'vitest'
import { normaliseLineup } from '@/lib/artists/lineup'

describe('normaliseLineup', () => {
  test('assigns contiguous billing order in input order (0 = headliner)', () => {
    expect(
      normaliseLineup([
        { name: 'Headliner', billing_order: 0 },
        { name: 'Support', billing_order: 1 },
      ]),
    ).toEqual([
      { artist_id: null, name: 'Headliner', slug: 'headliner', billing_order: 0 },
      { artist_id: null, name: 'Support', slug: 'support', billing_order: 1 },
    ])
  })

  test('orders by the supplied billing_order, not array order', () => {
    const result = normaliseLineup([
      { name: 'Support', billing_order: 5 },
      { name: 'Headliner', billing_order: 1 },
    ])
    expect(result.map((r) => r.name)).toEqual(['Headliner', 'Support'])
    expect(result.map((r) => r.billing_order)).toEqual([0, 1])
  })

  test('drops blank and whitespace-only names', () => {
    expect(
      normaliseLineup([
        { name: '  ', billing_order: 0 },
        { name: 'Real', billing_order: 1 },
      ]),
    ).toEqual([{ artist_id: null, name: 'Real', slug: 'real', billing_order: 0 }])
  })

  test('de-duplicates by slug, keeping the first occurrence', () => {
    expect(
      normaliseLineup([
        { name: 'Drake', billing_order: 0 },
        { name: 'drake', billing_order: 1 },
      ]),
    ).toEqual([{ artist_id: null, name: 'Drake', slug: 'drake', billing_order: 0 }])
  })

  test('preserves an existing artist_id', () => {
    expect(
      normaliseLineup([{ artist_id: 'abc', name: 'Existing', billing_order: 0 }]),
    ).toEqual([{ artist_id: 'abc', name: 'Existing', slug: 'existing', billing_order: 0 }])
  })

  test('drops names that slug to nothing', () => {
    expect(normaliseLineup([{ name: '!!!', billing_order: 0 }])).toEqual([])
  })

  test('returns empty for empty input', () => {
    expect(normaliseLineup([])).toEqual([])
  })
})
