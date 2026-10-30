import 'server-only'
import type { VenueMediaDeps } from './venue-images'

/**
 * LAWAL'S VENUE PHOTO QUEUE (the project manager's 16:52 of 30 October 2026, G: "Lawal approves per venue in /admin in
 * batches, one tap a venue, the best photo pre-picked; nothing shows publicly before approval").
 *
 * Every photograph waiting for a person (a harvested candidate matched to one of our venues, or one a venue sent),
 * read through public.venue_photo_queue and grouped by venue, the best first: a venue's own photograph before a
 * harvested one (it came with their yes), then the highest quality score, then the widest. The first of each venue is
 * the pre-picked one. A candidate matched only for review says so, so the match is checked before it is approved.
 */

export type WaitingPhoto = {
  readonly id: string
  readonly imageUrl: string
  readonly source: string
  readonly sourceUrl: string
  readonly licence: string
  readonly credit: string
  readonly quality: number | null
  readonly width: number | null
  readonly height: number | null
  readonly matchMethod: 'auto' | 'review' | 'manual' | null
  readonly matchDistanceM: number | null
  readonly permissionWords: string | null
}

export type WaitingVenue = {
  readonly venueId: string
  readonly venueName: string
  readonly city: string | null
  readonly photos: readonly WaitingPhoto[]
}

export type QueueRow = {
  id: string
  venue_id: string
  venue_name: string
  venue_city: string | null
  image_url: string
  source: string
  source_url: string
  licence: string
  attribution_text: string
  quality_score: number | null
  width: number | null
  height: number | null
  match_method: WaitingPhoto['matchMethod']
  match_distance_m: number | string | null
  permission_evidence: string | null
}

const own = (p: WaitingPhoto) => (p.source === 'venue' || p.source === 'organiser' ? 0 : 1)

/** Best first: the venue's own, then quality, then width. */
export function bestFirst(a: WaitingPhoto, b: WaitingPhoto): number {
  return own(a) - own(b) || (b.quality ?? -1) - (a.quality ?? -1) || (b.width ?? 0) - (a.width ?? 0)
}

/** Queue rows into venues, each with its photographs best first, the venues by name. */
export function groupWaiting(rows: readonly QueueRow[]): WaitingVenue[] {
  const byVenue = new Map<string, { venueName: string; city: string | null; photos: WaitingPhoto[] }>()
  for (const r of rows) {
    const group = byVenue.get(r.venue_id) ?? { venueName: r.venue_name, city: r.venue_city, photos: [] }
    group.photos.push({
      id: r.id,
      imageUrl: r.image_url,
      source: r.source,
      sourceUrl: r.source_url,
      licence: r.licence,
      credit: r.attribution_text,
      quality: r.quality_score,
      width: r.width,
      height: r.height,
      matchMethod: r.match_method,
      matchDistanceM: r.match_distance_m === null ? null : Number(r.match_distance_m),
      permissionWords: r.permission_evidence,
    })
    byVenue.set(r.venue_id, group)
  }
  return [...byVenue.entries()]
    .map(([venueId, g]) => ({ venueId, venueName: g.venueName, city: g.city, photos: [...g.photos].sort(bestFirst) }))
    .sort((a, b) => a.venueName.localeCompare(b.venueName))
}

/** Every photograph matched to a venue and waiting for a person, grouped by venue. */
export async function waitingVenuePhotos(deps: Pick<VenueMediaDeps, 'rpc'>): Promise<WaitingVenue[]> {
  const answer = await deps.rpc('venue_photo_queue', {})
  if (answer.error) throw new Error(`the waiting venue photographs could not be read: ${answer.error.message}`)
  return groupWaiting((Array.isArray(answer.data) ? answer.data : []) as QueueRow[])
}

/** How many harvested candidates match none of our venues yet. */
export async function unmatchedCandidateCount(deps: Pick<VenueMediaDeps, 'rpc'>): Promise<number> {
  const answer = await deps.rpc('venue_photo_unmatched_count', {})
  if (answer.error) throw new Error(`the unmatched candidates could not be counted: ${answer.error.message}`)
  return Number(answer.data ?? 0)
}
