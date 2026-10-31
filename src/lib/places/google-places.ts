import 'server-only'
import { withGoogleSpend, type RpcClient, type Spent } from '@/lib/google/spend-guard'
import { formatVenueWithAddress } from '@/lib/venues/format-venue-address'
import type { GooglePlace, OurVenue } from './venue-match'

/**
 * THE FOUR GOOGLE PLACES (NEW) CALLS, EACH THROUGH THE COST GUARD (src/lib/google/spend-guard.ts: the database says yes
 * first; no yes, no call). Server only: GOOGLE_MAPS_API_KEY never reaches a browser.
 *
 * From Google's own pages, read 31 October 2026:
 *   Text Search (New): POST https://places.googleapis.com/v1/places:searchText, 'X-Goog-FieldMask' required;
 *     'places.id' alone is the 'Text Search Essentials ID Only SKU'; locationBias is a circle whose 'radius must be
 *     between 0.0 and 50000.0' (places/web-service/text-search).
 *   Place Details (New): GET https://places.googleapis.com/v1/places/PLACE_ID; 'photos' and 'id' trigger 'Place Details
 *     Essentials IDs Only'; 'displayName' triggers 'Pro'; 'formattedAddress' and 'location' 'Essentials'
 *     (places/web-service/place-details).
 *   Place Photos (New): https://places.googleapis.com/v1/NAME/media?key=API_KEY with maxWidthPx 'between 1 and 4800';
 *     skipHttpRedirect=true returns JSON with 'photoUri'; 'You cannot cache a photo name. Also, the name can expire.';
 *     authorAttributions 'always present, but might be empty' and must be shown wherever the image is
 *     (places/web-service/place-photos).
 * So nothing here stores a photo name or a photo: callers ask afresh each time.
 */

const BASE = 'https://places.googleapis.com/v1'

export interface PhotoRef {
  /** Fresh from Google this call; never stored ('You cannot cache a photo name'). */
  readonly name: string
  readonly widthPx: number
  readonly heightPx: number
  readonly authors: readonly { readonly displayName: string; readonly uri: string | null }[]
}

const keyOrNull = () => process.env.GOOGLE_MAPS_API_KEY?.trim() || null
const noKey = { ok: false as const, reason: 'GOOGLE_MAPS_API_KEY is not set, so no Google call is made' }

async function asJson(res: Response, what: string): Promise<Record<string, unknown>> {
  if (!res.ok) throw new Error(`${what}: Google answered ${res.status}`)
  return (await res.json()) as Record<string, unknown>
}

/** Place ids near our venue's own point (Text Search IDs only, free), at most five. */
export async function candidatePlaceIds(db: RpcClient, venue: OurVenue): Promise<Spent<string[]>> {
  const key = keyOrNull()
  if (!key) return noKey
  return withGoogleSpend(db, { api: 'places_text_search_ids', units: 1, purpose: `venue match, ${venue.name}` }, async () => {
    const body = { textQuery: formatVenueWithAddress({ name: venue.name, address: venue.address }) ?? venue.name, pageSize: 5, locationBias: { circle: { center: { latitude: venue.lat, longitude: venue.lng }, radius: 150 } } }
    const res = await fetch(`${BASE}/places:searchText`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': 'places.id' }, body: JSON.stringify(body), cache: 'no-store' })
    const j = await asJson(res, 'Text Search')
    return ((j.places as { id?: string }[] | undefined) ?? []).map((p) => p.id).filter((id): id is string => typeof id === 'string')
  })
}

/** One candidate's name, address and point, for src/lib/places/venue-match.ts (Place Details Pro, once per venue). */
export async function placeForMatch(db: RpcClient, placeId: string, purpose: string): Promise<Spent<GooglePlace | null>> {
  const key = keyOrNull()
  if (!key) return noKey
  return withGoogleSpend(db, { api: 'places_details_pro', units: 1, purpose }, async () => {
    const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, { headers: { 'x-goog-api-key': key, 'x-goog-fieldmask': 'id,displayName,formattedAddress,location' }, cache: 'no-store' })
    const j = await asJson(res, 'Place Details')
    const loc = j.location as { latitude?: number; longitude?: number } | undefined
    const name = (j.displayName as { text?: string } | undefined)?.text
    if (typeof j.id !== 'string' || !name || typeof j.formattedAddress !== 'string' || typeof loc?.latitude !== 'number' || typeof loc.longitude !== 'number') return null
    return { id: j.id, displayName: name, formattedAddress: j.formattedAddress, lat: loc.latitude, lng: loc.longitude }
  })
}

/** The place's photos as Google lists them NOW (Place Details, photos field only: IDs Only, free). */
export async function freshPhotos(db: RpcClient, placeId: string, purpose: string): Promise<Spent<PhotoRef[]>> {
  const key = keyOrNull()
  if (!key) return noKey
  return withGoogleSpend(db, { api: 'places_details_ids', units: 1, purpose }, async () => {
    const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, { headers: { 'x-goog-api-key': key, 'x-goog-fieldmask': 'photos' }, cache: 'no-store' })
    const j = await asJson(res, 'Place Details photos')
    const photos = (j.photos as { name?: string; widthPx?: number; heightPx?: number; authorAttributions?: { displayName?: string; uri?: string }[] }[] | undefined) ?? []
    return photos
      .filter((p) => typeof p.name === 'string')
      .map((p) => ({
        name: p.name as string,
        widthPx: Number(p.widthPx ?? 0),
        heightPx: Number(p.heightPx ?? 0),
        authors: (p.authorAttributions ?? []).filter((a) => a.displayName).map((a) => ({ displayName: a.displayName as string, uri: a.uri ?? null })),
      }))
  })
}

/** A fresh, short-lived address for one photo (Place Photos with skipHttpRedirect; the photo is billed here). */
export async function photoUri(db: RpcClient, photoName: string, maxWidthPx: number, purpose: string): Promise<Spent<string | null>> {
  const key = keyOrNull()
  if (!key) return noKey
  const width = Math.min(4800, Math.max(1, Math.round(maxWidthPx)))
  return withGoogleSpend(db, { api: 'places_photo', units: 1, purpose }, async () => {
    const res = await fetch(`${BASE}/${photoName}/media?maxWidthPx=${width}&skipHttpRedirect=true`, { headers: { 'x-goog-api-key': key }, cache: 'no-store' })
    const j = await asJson(res, 'Place Photo')
    return typeof j.photoUri === 'string' ? j.photoUri : null
  })
}
