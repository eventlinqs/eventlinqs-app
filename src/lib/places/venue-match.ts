/**
 * IS THIS GOOGLE PLACE OUR VENUE? (the CONTROLLER's note of 5.55 pm, item 4, of 31 October 2026: 'venue identity by verified name
 * AND address AND location, never text alone where ambiguous'). A Google photo reaches a page only for a place this
 * says yes to, so a near miss is a no, with its reason, never a guess.
 *
 * NAME: the two names carry the same words once case, punctuation, '&' and the articles are set aside; a word one
 * name adds is allowed only when it is a place word from the addresses (a suburb such as 'Richmond'). So 'The Corner
 * Hotel' is the 'Corner Hotel', and 'Forum Fitness Studio' is never 'Forum'.
 * ADDRESS: where our address has a street number, Google's must carry the same number on the same street; where it
 * has none, every word of our first address part (the street or square) must appear in Google's. No address of our
 * own, no match: name and location alone are text and a point, not an identity.
 * LOCATION: within MAX_METRES of our venue's own coordinates.
 *
 * Pure: src/lib/places/google-places.ts asks Google; this only judges.
 */

export const MAX_METRES = 150

export interface OurVenue {
  readonly name: string
  readonly address: string | null
  readonly lat: number
  readonly lng: number
}

export interface GooglePlace {
  readonly id: string
  readonly displayName: string
  readonly formattedAddress: string
  readonly lat: number
  readonly lng: number
}

export type Match =
  | { readonly ok: true; readonly placeId: string; readonly evidence: { readonly name: string; readonly address: string; readonly metres: number } }
  | { readonly ok: false; readonly reason: string }

const ARTICLES = new Set(['the', 'a', 'an'])
const STREET_WORDS: Readonly<Record<string, string>> = { street: 'st', road: 'rd', avenue: 'ave', lane: 'ln', place: 'pl', parade: 'pde', terrace: 'tce', drive: 'dr', highway: 'hwy', square: 'sq' }

const words = (s: string): string[] =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)

const addressWords = (s: string): string[] => words(s).map((w) => STREET_WORDS[w] ?? w)

function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

function namesAgree(ours: string, theirs: string, placeWords: ReadonlySet<string>): boolean {
  const a = new Set(words(ours).filter((w) => !ARTICLES.has(w)))
  const b = new Set(words(theirs).filter((w) => !ARTICLES.has(w)))
  if (a.size === 0 || b.size === 0) return false
  const extraInB = [...b].filter((w) => !a.has(w))
  const extraInA = [...a].filter((w) => !b.has(w))
  return [...extraInA, ...extraInB].every((w) => placeWords.has(w))
}

function addressesAgree(ours: string, theirs: string): boolean {
  const t = addressWords(theirs)
  // The street number is read from the first part only (before the first comma), so a postcode is never taken for it.
  const firstPart = addressWords(ours.split(',')[0] ?? '')
  const number = firstPart.find((w) => /^\d+[a-z]?$/.test(w))
  if (number) {
    const street = firstPart[firstPart.indexOf(number) + 1]
    const i = t.indexOf(number)
    return i >= 0 && street !== undefined && t[i + 1] === street
  }
  return firstPart.length > 0 && firstPart.every((w) => t.includes(w))
}

export function matchVenue(ours: OurVenue, place: GooglePlace, maxMetres = MAX_METRES): Match {
  if (!ours.address || !ours.address.trim()) return { ok: false, reason: 'our venue has no address, so name and location alone cannot prove it' }
  const metres = Math.round(metresBetween(ours.lat, ours.lng, place.lat, place.lng))
  if (metres > maxMetres) return { ok: false, reason: `Google's place is ${metres} metres from our venue, beyond ${maxMetres}` }
  if (!addressesAgree(ours.address, place.formattedAddress)) return { ok: false, reason: `the address does not agree: ours '${ours.address}', Google's '${place.formattedAddress}'` }
  const placeWords = new Set([...addressWords(ours.address), ...addressWords(place.formattedAddress)].filter((w) => !/^\d/.test(w)))
  if (!namesAgree(ours.name, place.displayName, placeWords)) return { ok: false, reason: `the name does not agree: ours '${ours.name}', Google's '${place.displayName}'` }
  return { ok: true, placeId: place.id, evidence: { name: place.displayName, address: addressWords(place.formattedAddress).join(' '), metres } }
}
