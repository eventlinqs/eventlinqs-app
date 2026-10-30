import { venueSlugify } from './venue-slug'

/**
 * EACH PARTNER VENUE'S OWN TRACKED CODE (the project manager's 17:25 of 30 October 2026, D3). A sheet at the bar or door
 * prints /go/v/<venue id>: the id, because a printed code must outlive a rename, and a venue merged away keeps working by
 * landing on the venue it merged into. A press lands on the venue's page on THIS site, its host never taken from anything
 * but the request, so the hop can never be pointed elsewhere; a venue nobody knows lands on /events (Law 5).
 *
 * A press is an arrival, never a sale. Pure: src/lib/venues/venue-go.ts reads and counts.
 */

export type VenueVia = 'qr' | 'link'
export type GoVenue = { readonly id: string; readonly name: string; readonly removed: boolean }
export type FollowVenueDeps = {
  venue(id: string): Promise<GoVenue | null>
  mergedInto(id: string): Promise<string | null>
}

const VENUE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A merge of a merge is real; more than this is a loop in the records, and a press lands on /events instead. */
const MAX_MERGE_STEPS = 5

export function venueGoUrl(venueId: string, origin: string): string {
  return `${new URL(origin).origin}/go/v/${venueId}?via=qr`
}

export function venueViaOf(raw: string | null | undefined): VenueVia {
  return raw === 'qr' ? 'qr' : 'link'
}

export function venueGoDestination(venueName: string | null, requestOrigin: string, via: VenueVia): string {
  const handle = venueName === null ? '' : venueSlugify(venueName)
  const landing = new URL(handle ? `/venues/${handle}` : '/events', new URL(requestOrigin).origin)
  landing.searchParams.set('utm_source', 'venue')
  landing.searchParams.set('utm_medium', via)
  landing.searchParams.set('utm_campaign', 'venue_go')
  return landing.toString()
}

/** The live venue a printed code means now, following its merges, or null. */
export async function followVenue(code: string, deps: FollowVenueDeps): Promise<GoVenue | null> {
  if (!VENUE_ID.test(code)) return null
  let id = code
  for (let step = 0; step <= MAX_MERGE_STEPS; step += 1) {
    const venue = await deps.venue(id)
    if (venue === null) return null
    if (!venue.removed) return venue
    const next = await deps.mergedInto(id)
    if (next === null || next === id) return null
    id = next
  }
  return null
}
