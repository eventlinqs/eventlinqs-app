import type { Spent } from '@/lib/google/spend-guard'
import { matchVenue, type GooglePlace, type OurVenue } from './venue-match'

/**
 * FINDING ONE VENUE's GOOGLE PLACE (directive of 31 October, 5.44 pm, section 6: 'per venue confirm identity'). Google's
 * nearby candidates (Text Search IDs only, src/lib/places/google-places.ts) are each read once and judged by
 * ./venue-match.ts; the first that agrees is the venue's. Every refusal is kept as evidence. A cost guard refusal STOPS
 * the search and says so: a quota reached is not a venue without a match. A venue with no address of its own is never
 * searched, so no call is spent on what could not be proved.
 *
 * The two Google calls are handed in, so this is tested without Google and the caller decides the purpose text.
 */

export interface PlaceAsker {
  candidates(venue: OurVenue): Promise<Spent<string[]>>
  details(placeId: string): Promise<Spent<GooglePlace | null>>
}

export type VenuePlace =
  | { readonly state: 'matched'; readonly placeId: string; readonly evidence: { readonly name: string; readonly address: string; readonly metres: number }; readonly refused: readonly string[] }
  | { readonly state: 'no match'; readonly refused: readonly string[] }
  | { readonly state: 'stopped'; readonly reason: string }

export async function findVenuePlace(venue: OurVenue, ask: PlaceAsker): Promise<VenuePlace> {
  if (!venue.address || !venue.address.trim()) return { state: 'no match', refused: ['our venue has no address, so it is not searched'] }
  const found = await ask.candidates(venue)
  if (!found.ok) return { state: 'stopped', reason: found.reason }
  const refused: string[] = []
  for (const id of found.value) {
    const place = await ask.details(id)
    if (!place.ok) return { state: 'stopped', reason: place.reason }
    if (!place.value) { refused.push(`${id}: Google gave no name, address or location`); continue }
    const m = matchVenue(venue, place.value)
    if (m.ok) return { state: 'matched', placeId: m.placeId, evidence: m.evidence, refused }
    refused.push(m.reason)
  }
  return { state: 'no match', refused }
}
