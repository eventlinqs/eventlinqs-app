/**
 * ONE venue address formatter (close-out UX1.2).
 *
 * WHY THIS FILE EXISTS. The first real outside organiser event on production
 * showed this under "Getting there":
 *
 *     Quakers Centre, Quakers Centre, 484 William Street, West Melbourne, VIC, Australia
 *
 * Two places were each adding the venue name. `src/app/events/[slug]/page.tsx`
 * built `fullAddress` as `[venue_name, venue_address, city, state, country]`,
 * and `KnowBeforeYouGo` then rendered `[venueName, fullAddress]`. Neither was
 * wrong on its own and the pair was wrong on the page, which is the signature
 * of a missing formatter: the composition rule lived nowhere, so it was
 * reinvented at every call site.
 *
 * The close-out asked for the fix at the FORMATTER, not the page, and for it to
 * hold on a venue whose name IS part of its address and one whose name is not.
 * Both are real: organisers type "Quakers Centre, 484 William Street" into the
 * address field about as often as they type "484 William Street".
 *
 * THE RULE. A segment appears at most once. Comparison is on a normalised form
 * (case, punctuation and spacing folded), so "Quakers Centre" and
 * "QUAKERS CENTRE," are one segment, but "West Melbourne" and "Melbourne" stay
 * two, because a substring is not a duplicate: dropping "Melbourne" because
 * "West Melbourne" contains it would delete a real suburb.
 */

export interface VenueAddressParts {
  name?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postcode?: string | null
}

/**
 * Fold a segment for comparison only. Never for display: the organiser's own
 * capitalisation is what ships.
 */
function normalise(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[.,/\\'"()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split a free-text address field into its comma-separated segments, so a name
 * already typed into the address is comparable with the name field.
 */
function segments(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/** Join segments, dropping any whose normalised form has already been used. */
function joinUnique(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    for (const segment of segments(part)) {
      const key = normalise(segment)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(segment)
    }
  }
  return out
}

/*
 * THE LOCALITY LINE IS SAID ONCE (LAUNCH-READINESS row 17, read on production on 7 November 2026). 'Yarra Park,
 * Melbourne VIC, Melbourne, VIC, Australia': an Australian address that already ends in Australia Post's last line,
 * which 'should contain the locality or suburb, state and postcode' with 'spaces between the locality, state and
 * postcode' (https://auspost.com.au/personal/sending/sending-guidelines/addressing-guidelines, fetched 7 November 2026),
 * had the guide's city and state added after it, because 'Melbourne VIC' is one segment and 'Melbourne' and 'VIC' are
 * two. 28 of 82 venue rows on upcoming nights did it, on 406 nights. Australia Post's own barcode notes list a doubled
 * state ('Sydney NSW NSW 2000') as an error to remove
 * (https://auspost.com.au/content/dam/auspost_corp/media/documents/Barcode_hints_tips.pdf, read 7 November 2026).
 *
 * So, for an address in Australia (or with no country): a segment '<locality> <state> [<postcode>]' already states the
 * place, and the city, state and postcode fields are not added again; a segment '<state> [<postcode>]' states the state,
 * and only the state and postcode fields are left out. The locality the organiser or the source wrote stands: a suburb
 * such as Newtown is what the post and a map use, and the guide's city is not its postal locality.
 */
const STATES: Readonly<Record<string, string>> = {
  vic: 'vic', victoria: 'vic',
  nsw: 'nsw', 'new south wales': 'nsw',
  qld: 'qld', queensland: 'qld',
  sa: 'sa', 'south australia': 'sa',
  wa: 'wa', 'western australia': 'wa',
  tas: 'tas', tasmania: 'tas',
  act: 'act', 'australian capital territory': 'act',
  nt: 'nt', 'northern territory': 'nt',
}
const STATE_WORDS = Object.keys(STATES).sort((a, b) => b.length - a.length).join('|')
const LOCALITY_LINE = new RegExp(`^(.+) (${STATE_WORDS})(?: \\d{4})?$`)
const STATE_ONLY = new RegExp(`^(${STATE_WORDS})(?: \\d{4})?$`)

/** Which of the city, state and postcode fields the address field has already stated. */
function statedInAddress(parts: VenueAddressParts): { place: boolean; state: boolean } {
  const country = normalise(parts.country ?? '')
  if (country && country !== 'au' && country !== 'australia') return { place: false, state: false }
  const keys = segments(parts.address).map(normalise)
  const place = keys.some((k) => LOCALITY_LINE.test(k))
  return { place, state: place || keys.some((k) => STATE_ONLY.test(k)) }
}

/** The parts after the address, less any the address already states. */
function afterAddress(parts: VenueAddressParts): Array<string | null | undefined> {
  const stated = statedInAddress(parts)
  return [
    stated.place ? null : parts.city,
    stated.state ? null : parts.state,
    stated.state ? null : parts.postcode,
    parts.country,
  ]
}

/**
 * The address ALONE, with the venue name removed if the organiser typed it into
 * the address field. Use where the name is already on screen as a heading.
 */
export function formatVenueAddress(parts: VenueAddressParts): string | null {
  const nameKeys = new Set(segments(parts.name).map(normalise))
  const joined = joinUnique([parts.address, ...afterAddress(parts)])
  const withoutName = joined.filter(segment => !nameKeys.has(normalise(segment)))
  return withoutName.length > 0 ? withoutName.join(', ') : null
}

/**
 * The venue name FOLLOWED BY its address, with the name appearing exactly once
 * however the organiser typed it. This is the string "Getting there" shows and
 * the one the Maps link is built from, so the pin and the words always agree.
 */
export function formatVenueWithAddress(parts: VenueAddressParts): string | null {
  const joined = joinUnique([parts.name, parts.address, ...afterAddress(parts)])
  return joined.length > 0 ? joined.join(', ') : null
}

/**
 * THE STREET ADDRESS NAMING ITS PLACE (8 November 2026, WINDOW 5A; found on the read back of A Moment of Sanity, whose
 * page said "800 High Street, Melbourne": High Street runs through several suburbs and the venue is in Thornbury). A
 * venue whose locality is on record (its suburb, from its coordinates) but missing from the street it was given has the
 * locality added after the street, so every page, card and directions link that reads the address names the right
 * place. Kept as it is: an address that already names its suburb or its city, and a suburb that is the city itself
 * (Melbourne, Melbourne CBD, Ballarat Central, Bendigo City). Pure.
 */
export function addressNamingItsPlace(address: string | null, suburb: string | null, city: string | null): string | null {
  const street = (address ?? '').trim()
  const place = (suburb ?? '').trim()
  if (street === '' || place === '') return address
  const names = (word: string) => new RegExp(`(^|[^a-z])${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(street.toLowerCase())
  if (names(place)) return address
  const town = (city ?? '').trim().toLowerCase()
  if (town !== '' && ([town, `${town} cbd`, `${town} central`, `${town} city`].includes(place.toLowerCase()) || names(town))) return address
  return `${street}, ${place}`
}
