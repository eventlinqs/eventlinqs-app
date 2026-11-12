import 'server-only'
import { createPublicClient } from '@/lib/supabase/public-client'
import { eventCoversFor, type VenuePhoto, type VenuePhotosRpc } from '@/lib/venues/venue-photos-read'
import { venueCreditLine } from '@/lib/images/venue-photo-chain'
import type { DirectoryRow } from './whats-on-directory'

/**
 * THE VENUE'S PHOTOGRAPH ON A GUIDE CARD (Lawal, 12 November 2026, 01:01: "Where an event has no permitted photo of its own
 * but its venue has one (venue-supplied, or under a licence that permits our use, recorded in the photo lock with its
 * credit), the card shows the venue photo, labelled as the venue ... through the existing photo lock; no new path").
 *
 * The photo lock is the one path: event_cover_photos_for answers, for each night asked, the venue photograph the database
 * dealt to that night (one photo one night, never reused; never a photograph of another venue), with its licence and
 * credit. It was kept off the guide until a credited design existed (round 5 fault 5): the guide's cards now print the
 * credit under the photograph (#262), and the venue is named beside it, so a venue is never presented as the act.
 *
 * The night's own photograph always wins: only a row with no `thumb` is asked about, and the venue photo goes in its own
 * field, `venueThumb`, so Big nights, which asks for the night's own photograph (law 18), is untouched.
 */

/** The rows with each dealt venue photograph applied to the nights that have none of their own. Pure. */
export function applyVenueThumbs(rows: readonly DirectoryRow[], covers: ReadonlyMap<string, VenuePhoto>): DirectoryRow[] {
  return rows.map((r) => {
    if (r.thumb) return r
    const photo = covers.get(r.id)
    if (!photo) return r
    return { ...r, venueThumb: photo.imageUrl, venueThumbCredit: venueCreditLine(photo) }
  })
}

/**
 * One read for the whole guide. A failed read leaves every row as it was, said in the server log: the card then shows no
 * photograph, never a stand-in, and no page is lost to it.
 */
export async function withVenueThumbs(rows: readonly DirectoryRow[], deps?: VenuePhotosRpc): Promise<DirectoryRow[]> {
  const ask = [...new Set(rows.filter((r) => !r.thumb).map((r) => r.id))]
  if (ask.length === 0) return [...rows]
  try {
    const rpc: VenuePhotosRpc = deps ?? (() => {
      const db = createPublicClient()
      return { rpc: (name, args) => db.rpc(name, args) as unknown as ReturnType<VenuePhotosRpc['rpc']> }
    })()
    return applyVenueThumbs(rows, await eventCoversFor(ask, 'event_card', rpc))
  } catch (error) {
    console.error('[venue-thumbs] no venue photographs on the guide this render:', error instanceof Error ? error.message : error)
    return [...rows]
  }
}
