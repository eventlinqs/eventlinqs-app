import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { freshPhotos, photoUri } from './google-places'
import { pickPhoto } from './pick-photo'

/**
 * ONE VENUE's GOOGLE PHOTO FOR ONE VIEW OF ITS EVENT PAGE (Lawal's ruling of 30 October 23:56: event detail pages
 * only, never list cards, a hard daily quota). Only a venue a person APPROVED in venue_google_places is asked for;
 * its photo list is read afresh and the photo's short-lived address fetched afresh, because Google does not allow a
 * photo name or a photo to be kept. Each step goes through the cost guard, so the day's quota ends it honestly: the
 * page then keeps its fallback. Never throws to a page: it answers with the reason instead.
 */

export interface VenueGooglePhoto {
  readonly uri: string
  readonly widthPx: number
  readonly heightPx: number
  /** Shown under the photo, linked, with 'Google Maps' (Google: credit the author wherever the photo is shown). */
  readonly authors: readonly { readonly displayName: string; readonly uri: string | null; readonly photoUri: string | null }[]
  /** The photo on Google Maps, and where to report it (Google, places/web-service/policies, read 31 October 2026). */
  readonly mapsUri: string | null
  readonly flagUri: string | null
}

export type VenuePhotoAnswer = { readonly ok: true; readonly photo: VenueGooglePhoto } | { readonly ok: false; readonly reason: string }

export async function venueGooglePhoto(db: SupabaseClient, venueId: string, widthPx: number): Promise<VenuePhotoAnswer> {
  try {
    const { data, error } = await db.from('venue_google_places').select('place_id, approved_at').eq('venue_id', venueId).maybeSingle<{ place_id: string; approved_at: string | null }>()
    if (error) return { ok: false, reason: `the venue's Google place could not be read: ${error.message}` }
    if (!data) return { ok: false, reason: 'this venue has no Google place matched' }
    if (!data.approved_at) return { ok: false, reason: "this venue's Google photos are not approved by a person yet" }
    const purpose = `event page photo, venue ${venueId}`
    const list = await freshPhotos(db, data.place_id, purpose)
    if (!list.ok) return list
    const chosen = pickPhoto(list.value)
    if (!chosen) return { ok: false, reason: 'Google lists no landscape photo of 1000 px or wider with an author to credit' }
    const uri = await photoUri(db, chosen.name, widthPx, purpose)
    if (!uri.ok) return uri
    if (!uri.value) return { ok: false, reason: 'Google gave no photo address' }
    return { ok: true, photo: { uri: uri.value, widthPx: chosen.widthPx, heightPx: chosen.heightPx, authors: chosen.authors, mapsUri: chosen.mapsUri, flagUri: chosen.flagUri } }
  } catch (err) {
    return { ok: false, reason: `Google could not be asked: ${err instanceof Error ? err.message : String(err)}` }
  }
}
