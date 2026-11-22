/**
 * A VENUE BY ITS IDENTITY, NEVER BY ITS SPELLING (Lawal's permanent publishing reliability correction, 19:04 of
 * 22 November 2026, section 1; the PM's 19:05, item 1). The 18:40 run held AMCF's final day story because its place line
 * said 'Federation Square' and the listing reads 'Fed Square': one venue, two names, refused as two. A place line is
 * judged by the venue it names:
 *  - SAME: it names the night's own venue, by the listing's venue name, the venue row's own name, or an alias recorded for
 *    that venue id (venue_aliases, each with its source), formatting normalised. It passes.
 *  - OTHER: it names, exactly, a different venue we hold (another venue id's name or recorded alias). Two venue ids are
 *    never equal: the piece is held, that piece only (a material discrepancy).
 *  - UNKNOWN: it names no venue we hold. A safe, unambiguous difference: the place is corrected from the night's own rows
 *    before publishing (correctPlaceLines), and the correction is recorded.
 * No fuzzy matching: a name matches only as a whole run of words after normalising, never by edit distance or a prefix.
 * Pure.
 */

const PIN = '\u{1F4CD}'

/** Every venue name and alias we hold, normalised, to its venue id and the name as written. */
export type KnownVenues = ReadonlyMap<string, { readonly venueId: string; readonly name: string }>

/** Lower case, accents and punctuation gone, '&' read as 'and', a leading 'the' dropped, spaces single. */
export function normaliseVenueName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/\s+/g, ' ')
}

/** The place a 📍 line names: its words after the pin, up to the first comma. Null when the line carries none. */
export function placeOfLine(line: string): string | null {
  const at = line.indexOf(PIN)
  if (at < 0) return null
  const place = line.slice(at + PIN.length).split(',')[0]?.trim() ?? ''
  return place === '' ? null : place
}

const containsRun = (hay: string, needle: string) => needle !== '' && ` ${hay} `.includes(` ${needle} `)

export type PlaceVerdict = { readonly kind: 'same' } | { readonly kind: 'other'; readonly venueId: string; readonly name: string } | { readonly kind: 'unknown' }

/**
 * The venue a place names. `own` is the night's own names (listing, row, aliases); `known` maps every normalised name
 * and alias we hold to its venue id. The night's own venue id, when it has a row, is never 'other'.
 */
export function placeVerdict(place: string, own: readonly string[], known: KnownVenues, ownVenueId: string | null): PlaceVerdict {
  const p = normaliseVenueName(place)
  if (p === '') return { kind: 'unknown' }
  if (own.map(normaliseVenueName).some((n) => containsRun(p, n))) return { kind: 'same' }
  const hit = known.get(p)
  if (hit && hit.venueId !== ownVenueId) return { kind: 'other', venueId: hit.venueId, name: hit.name }
  if (hit && hit.venueId === ownVenueId) return { kind: 'same' }
  return { kind: 'unknown' }
}

/** One correction made to a caption before it posts, as it is recorded. */
export type PlaceCorrection = { readonly from: string; readonly to: string }

/**
 * A caption with every 📍 line whose place names no venue we hold given the night's own venue name instead, the rest of
 * the line kept (its street and city). A line that names the night's venue, or another venue, is left as it is: the
 * first passes and the second is the gate's to hold. Pure.
 */
export function correctPlaceLines(
  caption: string,
  night: { readonly canonical: string | null; readonly own: readonly string[]; readonly venueId: string | null },
  known: KnownVenues,
): { readonly caption: string; readonly corrections: readonly PlaceCorrection[] } {
  if (!night.canonical) return { caption, corrections: [] }
  const corrections: PlaceCorrection[] = []
  const lines = caption.split('\n').map((line) => {
    const place = placeOfLine(line)
    if (place === null) return line
    if (placeVerdict(place, night.own, known, night.venueId).kind !== 'unknown') return line
    const fixed = line.replace(place, night.canonical as string)
    corrections.push({ from: line, to: fixed })
    return fixed
  })
  return { caption: lines.join('\n'), corrections }
}

/** Every name and alias we hold, normalised, to its venue id; a name two venues share is left out, never guessed. */
export function knownVenueIndex(rows: readonly { readonly venueId: string; readonly name: string }[]): Map<string, { readonly venueId: string; readonly name: string }> {
  const out = new Map<string, { readonly venueId: string; readonly name: string }>()
  const shared = new Set<string>()
  for (const r of rows) {
    const k = normaliseVenueName(r.name)
    if (k === '') continue
    const had = out.get(k)
    if (had && had.venueId !== r.venueId) shared.add(k)
    else if (!had) out.set(k, { venueId: r.venueId, name: r.name })
  }
  for (const k of shared) out.delete(k)
  return out
}

/**
 * Whether a place as a slide or card prints it names one of the venue's own names (the listing's, the row's, an alias),
 * normalised, as a whole run of words either way ('Arts Centre' on a card for 'Arts Centre Melbourne'). Pure.
 */
export function namesOwnVenue(place: string, names: readonly (string | null | undefined)[]): boolean {
  const p = normaliseVenueName(place)
  if (p === '') return false
  return names.some((n) => {
    const v = normaliseVenueName(n ?? '')
    return v !== '' && (containsRun(p, v) || containsRun(v, p))
  })
}
