import { describe, expect, test } from 'vitest'
import { partitionFollows } from '@/lib/follows/orphans'

const liveArtists = new Set(['artist-1', 'artist-2'])

describe('partitionFollows', () => {
  test('keeps a valid artist follow and a valid sub-genre follow', () => {
    const result = partitionFollows(
      [
        { followable_type: 'artist', followable_id: 'artist-1' },
        { followable_type: 'subgenre', followable_id: 'techno' },
      ],
      liveArtists,
    )
    expect(result).toEqual({ artistIds: ['artist-1'], subgenreSlugs: ['techno'] })
  })

  test('drops an artist follow whose artist no longer exists (orphan)', () => {
    const result = partitionFollows(
      [{ followable_type: 'artist', followable_id: 'deleted-artist' }],
      liveArtists,
    )
    expect(result).toEqual({ artistIds: [], subgenreSlugs: [] })
  })

  test('drops a sub-genre follow whose slug left the taxonomy (orphan)', () => {
    const result = partitionFollows(
      [{ followable_type: 'subgenre', followable_id: 'gabber-no-longer-listed' }],
      liveArtists,
    )
    expect(result).toEqual({ artistIds: [], subgenreSlugs: [] })
  })

  test('drops an unknown followable_type', () => {
    const result = partitionFollows(
      [{ followable_type: 'genre', followable_id: 'african' }],
      liveArtists,
    )
    expect(result).toEqual({ artistIds: [], subgenreSlugs: [] })
  })

  test('de-duplicates repeated follows', () => {
    const result = partitionFollows(
      [
        { followable_type: 'artist', followable_id: 'artist-1' },
        { followable_type: 'artist', followable_id: 'artist-1' },
        { followable_type: 'subgenre', followable_id: 'techno' },
        { followable_type: 'subgenre', followable_id: 'techno' },
      ],
      liveArtists,
    )
    expect(result).toEqual({ artistIds: ['artist-1'], subgenreSlugs: ['techno'] })
  })

  test('returns empty arrays for no follows', () => {
    expect(partitionFollows([], liveArtists)).toEqual({ artistIds: [], subgenreSlugs: [] })
  })
})
