import { artistSlug } from './slug'

export type LineupInput = {
  artist_id?: string | null
  name: string
  billing_order: number
}

export type NormalisedLineupEntry = {
  artist_id: string | null
  name: string
  slug: string
  billing_order: number
}

/**
 * Cleans a raw artist lineup into the canonical set to persist:
 * - drops entries whose name is blank or slugs to nothing,
 * - de-duplicates by slug (first occurrence in billing order wins),
 * - sorts by the supplied billing_order, then re-numbers contiguously from 0
 *   (0 = headliner) so the stored order has no gaps.
 *
 * Pure: artist_id resolution (find-or-create) happens in the action that calls
 * this. An entry that already carries an artist_id keeps it.
 */
export function normaliseLineup(artists: LineupInput[]): NormalisedLineupEntry[] {
  const sorted = [...artists].sort((a, b) => a.billing_order - b.billing_order)

  const seen = new Set<string>()
  const result: NormalisedLineupEntry[] = []

  for (const entry of sorted) {
    const name = entry.name.trim()
    if (name.length === 0) continue

    const slug = artistSlug(name)
    if (slug.length === 0) continue
    if (seen.has(slug)) continue
    seen.add(slug)

    result.push({
      artist_id: entry.artist_id ?? null,
      name,
      slug,
      billing_order: result.length,
    })
  }

  return result
}

export type EventArtistRow = {
  event_id: string
  artist_id: string
  billing_order: number
}

/**
 * Maps a normalised lineup to event_artists rows, resolving artist ids from a
 * slug -> id map for name-only entries. Entries that still have no id (creation
 * failed or was skipped) are dropped so we never write a null artist_id.
 */
export function buildEventArtistRows(
  eventId: string,
  lineup: NormalisedLineupEntry[],
  idBySlug: ReadonlyMap<string, string>,
): EventArtistRow[] {
  return lineup
    .map((entry) => ({
      event_id: eventId,
      artist_id: entry.artist_id ?? idBySlug.get(entry.slug) ?? null,
      billing_order: entry.billing_order,
    }))
    .filter((row): row is EventArtistRow => Boolean(row.artist_id))
}
