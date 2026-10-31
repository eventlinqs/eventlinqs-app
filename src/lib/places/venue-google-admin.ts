import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { candidatePlaceIds, freshPhotos, photoUri, placeForMatch } from './google-places'
import { findVenuePlace, type VenuePlace } from './match-venue'
import { pickPhoto } from './pick-photo'
import type { OurVenue } from './venue-match'
import type { VenueGooglePhoto } from './venue-google-photo'

/**
 * THE PERSON's SIDE OF GOOGLE VENUE PHOTOS (directive of 31 October 17:44, section 6: 'per venue confirm identity ...
 * reject unrelated photos ... avoid logos, menus and low-quality screenshots ... check the mobile crop'). Nothing here
 * runs on its own: a person presses Find, looks, and approves or refuses. Every Google call goes through the cost guard
 * in ./google-places.ts. Only the place id, the evidence and the decision are kept (venue_google_places).
 */

export interface VenueRow {
  readonly id: string
  readonly name: string
  readonly address: string | null
  readonly upcoming: number
  readonly placeId: string | null
  readonly evidence: { readonly name?: string; readonly address?: string; readonly metres?: number } | null
  readonly approvedAt: string | null
  readonly refusedReason: string | null
}

type Venue = { id: string; name: string; address: string | null; suburb: string | null; state: string | null; postal_code: string | null; latitude: number | null; longitude: number | null }

const fullAddress = (v: Venue): string | null => {
  const tail = [v.state, v.postal_code].filter(Boolean).join(' ')
  const parts = [v.address, v.suburb, tail].map((p) => p?.trim()).filter(Boolean)
  return v.address?.trim() ? parts.join(', ') : null
}

const ourVenue = (v: Venue): OurVenue | null =>
  v.latitude === null || v.longitude === null ? null : { name: v.name, address: fullAddress(v), lat: v.latitude, lng: v.longitude }

/** Active venues with a point, those with upcoming published nights first, with their Google state. */
export async function venueRows(db: SupabaseClient): Promise<VenueRow[]> {
  const { data: vs, error } = await db.from('venues').select('id, name, address, suburb, state, postal_code, latitude, longitude').is('removed_at', null).eq('is_active', true).not('latitude', 'is', null).order('name').limit(500)
  if (error) throw new Error(`the venues could not be read: ${error.message}`)
  const venues = (vs ?? []) as Venue[]
  const ids = venues.map((v) => v.id)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: evs, error: e2 } = await db.from('events').select('venue_id').in('venue_id', ids).eq('status', 'published').gte('end_date', new Date().toISOString()).limit(5000)
    if (e2) throw new Error(`the upcoming nights could not be read: ${e2.message}`)
    for (const e of (evs ?? []) as { venue_id: string }[]) counts.set(e.venue_id, (counts.get(e.venue_id) ?? 0) + 1)
  }
  const { data: gs, error: e3 } = await db.from('venue_google_places').select('venue_id, place_id, match_evidence, approved_at, refused_reason').in('venue_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  if (e3) throw new Error(`the Google places could not be read: ${e3.message}`)
  const g = new Map(((gs ?? []) as { venue_id: string; place_id: string; match_evidence: VenueRow['evidence']; approved_at: string | null; refused_reason: string | null }[]).map((r) => [r.venue_id, r]))
  return venues
    .map((v) => ({ id: v.id, name: v.name, address: fullAddress(v), upcoming: counts.get(v.id) ?? 0, placeId: g.get(v.id)?.place_id ?? null, evidence: g.get(v.id)?.match_evidence ?? null, approvedAt: g.get(v.id)?.approved_at ?? null, refusedReason: g.get(v.id)?.refused_reason ?? null }))
    .sort((a, b) => b.upcoming - a.upcoming || a.name.localeCompare(b.name))
}

async function readVenue(db: SupabaseClient, venueId: string): Promise<Venue | null> {
  const { data, error } = await db.from('venues').select('id, name, address, suburb, state, postal_code, latitude, longitude').eq('id', venueId).maybeSingle()
  if (error) throw new Error(`the venue could not be read: ${error.message}`)
  return (data as Venue | null) ?? null
}

/** Find and keep the venue's Google place (unapproved: a person still has to look). */
export async function findAndKeep(db: SupabaseClient, venueId: string): Promise<VenuePlace> {
  const v = await readVenue(db, venueId)
  const ours = v ? ourVenue(v) : null
  if (!v || !ours) return { state: 'no match', refused: ['the venue has no point on the map'] }
  const purpose = `venue match, ${v.name}`
  const found = await findVenuePlace(ours, { candidates: (venue) => candidatePlaceIds(db, venue), details: (id) => placeForMatch(db, id, purpose) })
  if (found.state === 'matched') {
    const { error } = await db.from('venue_google_places').upsert({ venue_id: venueId, place_id: found.placeId, match_evidence: { ...found.evidence, refused: found.refused }, matched_at: new Date().toISOString(), approved_at: null, approved_by: null, refused_reason: null })
    if (error) throw new Error(`the match could not be kept: ${error.message}`)
  }
  return found
}

/** The venue's lead Google photo NOW, for a person to look at before deciding (billed per look, through the guard). */
export async function lookAtVenue(db: SupabaseClient, venueId: string): Promise<{ ok: true; photo: VenueGooglePhoto } | { ok: false; reason: string }> {
  const { data, error } = await db.from('venue_google_places').select('place_id').eq('venue_id', venueId).maybeSingle()
  if (error) return { ok: false, reason: error.message }
  if (!data) return { ok: false, reason: 'not matched yet' }
  const purpose = `admin look, venue ${venueId}`
  const list = await freshPhotos(db, (data as { place_id: string }).place_id, purpose)
  if (!list.ok) return list
  const chosen = pickPhoto(list.value)
  if (!chosen) return { ok: false, reason: 'Google lists no landscape photo of 1000 px or wider with an author to credit' }
  const uri = await photoUri(db, chosen.name, 1200, purpose)
  if (!uri.ok) return uri
  return uri.value ? { ok: true, photo: { uri: uri.value, widthPx: chosen.widthPx, heightPx: chosen.heightPx, authors: chosen.authors } } : { ok: false, reason: 'Google gave no photo address' }
}

export async function decide(db: SupabaseClient, venueId: string, by: string, decision: { approve: true } | { approve: false; reason: string }): Promise<void> {
  const patch = decision.approve
    ? { approved_at: new Date().toISOString(), approved_by: by, refused_reason: null }
    : { approved_at: null, approved_by: null, refused_reason: decision.reason }
  const { error } = await db.from('venue_google_places').update(patch).eq('venue_id', venueId)
  if (error) throw new Error(`the decision could not be kept: ${error.message}`)
}
