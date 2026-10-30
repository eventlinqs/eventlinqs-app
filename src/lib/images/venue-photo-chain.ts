import { isOwnPhoto } from '@/lib/images/event-media'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { createPublicClient } from '@/lib/supabase/public-client'
import { venuePhotosFor, type VenuePhoto, type VenuePhotosRpc, type VenueUse } from '@/lib/venues/venue-photos-read'

/**
 * THE CARD IMAGE CHAIN (the project manager's 16:42 and 16:52 of 30 October 2026, with Lawal): the night's own approved
 * photograph; else an approved photograph of THE ACTUAL VENUE; else the typographic cover (EventCardMedia draws it for
 * our composed cover). Never a photograph of another venue or event.
 *
 * Every card loader passes its rows through withVenuePhotos: one read for the page, never one a card (18:00 (2)). The
 * credit, by the 18:57 ruling: no text on a card image, so on the card it is the image's title attribute only, and on
 * the event page the line right under the photo, linked to the file page and the licence.
 */

export type ChainRow = { readonly id: string; readonly cover_image_url: string | null }

export type ChainCredit = {
  /** 'Photo: <author>, <licence>', where the licence asks for one. */
  readonly image_credit?: string | null
  readonly image_credit_file?: string | null
  readonly image_credit_licence?: string | null
}

export type ChainDeps = {
  venueIdsOf(eventIds: readonly string[]): Promise<ReadonlyMap<string, string>>
  photosOf(venueIds: readonly string[], use: VenueUse): Promise<ReadonlyMap<string, VenuePhoto>>
  /** Each venue's soonest public night that has not ended, on the whole platform, never only this page's. */
  soonestNightOf(venueIds: readonly string[]): Promise<ReadonlyMap<string, string>>
}

/** 'CC BY-SA 4.0' from the licence and the version its own link states; no version unless the link states one. */
function licenceLabel(photo: VenuePhoto): string {
  const base = photo.licence === 'cc_by' ? 'CC BY' : 'CC BY-SA'
  const version = photo.licenceUrl?.match(/\/licenses\/by(?:-sa)?\/(\d+(?:\.\d+)?)\/?/)?.[1]
  return version ? `${base} ${version}` : base
}

/** The printed credit: author and licence where a Creative Commons licence asks; none for CC0 or public domain. */
export function venueCreditLine(photo: VenuePhoto): string | null {
  if (photo.licence === 'cc0' || photo.licence === 'public_domain') return null
  if (photo.licence === 'cc_by' || photo.licence === 'cc_by_sa') {
    const who = (photo.author ?? photo.credit).trim()
    return who ? `Photo: ${who}, ${licenceLabel(photo)}` : null
  }
  const words = photo.credit.trim()
  return words ? `Photo: ${words}` : null
}

function publicDeps(): ChainDeps {
  const db = createPublicClient()
  return {
    async venueIdsOf(eventIds) {
      const { data, error } = await db.from('events').select('id, venue_id').in('id', [...eventIds])
      if (error) throw new Error(`the nights' venues could not be read: ${error.message}`)
      const out = new Map<string, string>()
      for (const row of (data ?? []) as { id: string; venue_id: string | null }[]) if (row.venue_id) out.set(row.id, row.venue_id)
      return out
    },
    photosOf: (venueIds, use) => venuePhotosFor(venueIds, use, { rpc: (name, args) => db.rpc(name, args) as unknown as ReturnType<VenuePhotosRpc['rpc']> }),
    async soonestNightOf(venueIds) {
      const now = new Date().toISOString()
      const { data, error } = await db
        .from('events')
        .select('id, venue_id, start_date')
        .match(PUBLIC_EVENT_MATCH)
        .in('venue_id', [...venueIds])
        .or(`end_date.gte.${now},and(end_date.is.null,start_date.gte.${now})`)
        .order('start_date', { ascending: true })
        .order('id', { ascending: true })
        .limit(5000)
      if (error) throw new Error(`the venues' soonest nights could not be read: ${error.message}`)
      const out = new Map<string, string>()
      for (const row of (data ?? []) as { id: string; venue_id: string | null }[]) {
        if (row.venue_id && !out.has(row.venue_id)) out.set(row.venue_id, row.id)
      }
      return out
    },
  }
}

/**
 * The rows with the chain's second link applied: a night without its own photograph takes its venue's approved one and
 * its credit. A night with no venue, or a venue with nothing approved, is left as it is. A failed read leaves every row
 * as it is, said in the server log: the card then shows its typographic cover, and no page is lost to it.
 */
export async function withVenuePhotos<T extends ChainRow>(
  rows: readonly T[],
  options: { readonly use?: VenueUse; readonly deps?: ChainDeps } = {},
): Promise<(T & ChainCredit)[]> {
  // The nights to ask about, never a narrowing of the rows: every row comes back, in its order (no-display-time-exclusion).
  const askAbout: string[] = []
  for (const row of rows) if (!isOwnPhoto(row.cover_image_url)) askAbout.push(row.id)
  if (askAbout.length === 0) return [...rows]
  try {
    const deps = options.deps ?? publicDeps()
    const venues = await deps.venueIdsOf(askAbout)
    const venueIds = [...new Set(askAbout.flatMap((id) => venues.get(id) ?? []))]
    if (venueIds.length === 0) return [...rows]
    const [photos, soonest] = await Promise.all([deps.photosOf(venueIds, options.use ?? 'event_card'), deps.soonestNightOf(venueIds)])
    return rows.map((row) => {
      if (isOwnPhoto(row.cover_image_url)) return row
      const venue = venues.get(row.id)
      // NO PHOTO IS EVER REUSED (Lawal's ruling of 31 October 2026, 00:14). Until the photo assignment table deals a
      // venue's photos one per night (the project manager's 00:22 (2)), its one photo shows on its soonest night alone,
      // on every page alike, and every other night there keeps the typographic cover (the same note's (4)).
      if (!venue || soonest.get(venue) !== row.id) return row
      const photo = photos.get(venue)
      if (!photo) return row
      return {
        ...row,
        cover_image_url: photo.imageUrl,
        image_credit: venueCreditLine(photo),
        image_credit_file: photo.fileUrl,
        image_credit_licence: photo.licenceUrl,
      }
    })
  } catch (error) {
    console.error('[venue-photo-chain] the typographic cover stands:', error instanceof Error ? error.message : error)
    return [...rows]
  }
}
