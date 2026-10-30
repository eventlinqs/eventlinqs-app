/**
 * THE VENUE PHOTOGRAPHS' PUBLIC READ, in a leaf: every card page reads it, so it must not pull the image pipeline that
 * src/lib/venues/venue-images.ts carries for uploads into a page's server bundle. venue-images.ts re-exports all of this,
 * so there is one definition. The rule of which photograph may show lives in the database (public.venue_photos_for).
 */

export type VenueUse = 'event_card' | 'event_page' | 'venue_page' | 'social'

export type VenuePhoto = {
  readonly imageUrl: string
  readonly credit: string
  readonly licence: string
  readonly licenceUrl: string | null
  readonly author: string | null
  /** The file page the event page's credit links to; null when the only source is a private email. */
  readonly fileUrl: string | null
}

export type VenuePhotosRpc = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code: string; message: string } | null }>
}

/**
 * The page's read: one call for all its cards, each venue's one photograph by venue id. A venue with nothing approved
 * for the use is simply absent. A failed read is thrown, and the caller falls to its typographic cover.
 */
export async function venuePhotosFor(venueIds: readonly string[], use: VenueUse, deps: VenuePhotosRpc): Promise<Map<string, VenuePhoto>> {
  const photos = new Map<string, VenuePhoto>()
  const venues = [...new Set(venueIds)]
  if (venues.length === 0) return photos
  const answer = await deps.rpc('venue_photos_for', { p_venues: venues, p_use: use })
  if (answer.error) throw new Error(`the venue photographs could not be read: ${answer.error.message}`)
  const rows = (Array.isArray(answer.data) ? answer.data : []) as ReadonlyArray<{
    venue_id: string
    image_url: string
    attribution_text: string
    licence: string
    licence_url: string | null
    author: string | null
    source_url: string | null
  }>
  for (const row of rows) {
    photos.set(row.venue_id, {
      imageUrl: row.image_url,
      credit: row.attribution_text,
      licence: row.licence,
      licenceUrl: row.licence_url,
      author: row.author,
      fileUrl: row.source_url,
    })
  }
  return photos
}
