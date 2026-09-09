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

/**
 * The address ALONE, with the venue name removed if the organiser typed it into
 * the address field. Use where the name is already on screen as a heading.
 */
export function formatVenueAddress(parts: VenueAddressParts): string | null {
  const nameKeys = new Set(segments(parts.name).map(normalise))
  const joined = joinUnique([parts.address, parts.city, parts.state, parts.postcode, parts.country])
  const withoutName = joined.filter(segment => !nameKeys.has(normalise(segment)))
  return withoutName.length > 0 ? withoutName.join(', ') : null
}

/**
 * The venue name FOLLOWED BY its address, with the name appearing exactly once
 * however the organiser typed it. This is the string "Getting there" shows and
 * the one the Maps link is built from, so the pin and the words always agree.
 */
export function formatVenueWithAddress(parts: VenueAddressParts): string | null {
  const joined = joinUnique([
    parts.name,
    parts.address,
    parts.city,
    parts.state,
    parts.postcode,
    parts.country,
  ])
  return joined.length > 0 ? joined.join(', ') : null
}
