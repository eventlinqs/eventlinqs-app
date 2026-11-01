/**
 * WHICH HELD VENUE A NEW CANDIDATE NAMES, for the review page's pre-selection (a person's accept publishes the night:
 * supabase/migrations/20261101171501_accept_publishes_the_night.sql). Pure. A venue is matched only in the candidate's
 * own city, by its name (case, quotes and spacing ignored) or by its street address; two held venues answering to one
 * name is no match. No match means the person chooses; a venue is never invented from the candidate's words.
 */

export type HeldVenue = { readonly id: string; readonly name: string; readonly address: string | null; readonly citySlug: string | null }
export type NamedPlace = { readonly venueName: string; readonly venueAddress: string | null; readonly citySlug: string | null }

const nameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The street part of an address: before the first comma, abbreviations made one form ('street' and 'st'). */
const streetKey = (s: string) =>
  nameKey(s.split(',')[0] ?? '')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bterrace\b/g, 'tce')

export function venueMatchFor(place: NamedPlace, venues: readonly HeldVenue[]): string | null {
  if (!place.citySlug) return null
  const inCity = venues.filter((v) => v.citySlug === place.citySlug)
  const byName = inCity.filter((v) => nameKey(v.name) === nameKey(place.venueName))
  if (byName.length === 1) return byName[0].id
  if (byName.length > 1) return null
  if (!place.venueAddress) return null
  const street = streetKey(place.venueAddress)
  if (!street || !/\d/.test(street)) return null
  const byStreet = inCity.filter((v) => v.address && streetKey(v.address) === street)
  return byStreet.length === 1 ? byStreet[0].id : null
}
