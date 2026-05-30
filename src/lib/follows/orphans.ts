import { isSubgenreSlug } from '@/lib/genres/data'

export type FollowRow = {
  followable_type: string
  followable_id: string
}

export type PartitionedFollows = {
  artistIds: string[]
  subgenreSlugs: string[]
}

/**
 * Splits a user's follow rows into the live artist ids and sub-genre slugs the
 * follow feed should query, discarding orphans: artist follows whose artist row
 * no longer exists, sub-genre follows whose slug has left the taxonomy, and any
 * unrecognised followable_type. Results are de-duplicated and order-stable.
 */
export function partitionFollows(
  follows: FollowRow[],
  liveArtistIds: ReadonlySet<string>,
): PartitionedFollows {
  const artistIds = new Set<string>()
  const subgenreSlugs = new Set<string>()

  for (const follow of follows) {
    if (follow.followable_type === 'artist') {
      if (liveArtistIds.has(follow.followable_id)) {
        artistIds.add(follow.followable_id)
      }
    } else if (follow.followable_type === 'subgenre') {
      if (isSubgenreSlug(follow.followable_id)) {
        subgenreSlugs.add(follow.followable_id)
      }
    }
  }

  return {
    artistIds: [...artistIds],
    subgenreSlugs: [...subgenreSlugs],
  }
}
