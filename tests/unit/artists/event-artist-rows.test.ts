import { describe, expect, test } from 'vitest'
import { buildEventArtistRows, type NormalisedLineupEntry } from '@/lib/artists/lineup'

function entry(over: Partial<NormalisedLineupEntry>): NormalisedLineupEntry {
  return { artist_id: null, name: 'X', slug: 'x', billing_order: 0, ...over }
}

describe('buildEventArtistRows', () => {
  test('resolves name-only entries via the slug -> id map', () => {
    const rows = buildEventArtistRows(
      'event-1',
      [entry({ slug: 'drake', billing_order: 0 })],
      new Map([['drake', 'artist-99']]),
    )
    expect(rows).toEqual([{ event_id: 'event-1', artist_id: 'artist-99', billing_order: 0 }])
  })

  test('keeps an explicit artist_id over the map', () => {
    const rows = buildEventArtistRows(
      'event-1',
      [entry({ artist_id: 'explicit', slug: 'drake', billing_order: 0 })],
      new Map([['drake', 'from-map']]),
    )
    expect(rows[0].artist_id).toBe('explicit')
  })

  test('drops an entry whose id could not be resolved (never writes null)', () => {
    const rows = buildEventArtistRows(
      'event-1',
      [entry({ slug: 'unknown', billing_order: 0 })],
      new Map(),
    )
    expect(rows).toEqual([])
  })

  test('preserves billing order across the set', () => {
    const rows = buildEventArtistRows(
      'event-1',
      [
        entry({ slug: 'a', billing_order: 0 }),
        entry({ slug: 'b', billing_order: 1 }),
      ],
      new Map([
        ['a', 'id-a'],
        ['b', 'id-b'],
      ]),
    )
    expect(rows.map((r) => [r.artist_id, r.billing_order])).toEqual([
      ['id-a', 0],
      ['id-b', 1],
    ])
  })
})
