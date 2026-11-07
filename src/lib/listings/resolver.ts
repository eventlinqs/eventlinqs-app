import { sourceHostOf } from './judge'

/**
 * THE RESOLVER'S RULING, ONE FACT AT A TIME (Lawal, 06:21 on 7 November 2026: 'Any mismatch is not hidden. Any mismatch, you
 * go and verify which is the proper and the best event ... Unless your verification still brings conflict or discrepancies,
 * then you can have it hidden.'; the CONTROLLER's 10:50 rulings). Pure: the pages are read by the caller (the polite reader,
 * robots.txt first), and each value arrives in one form per fact (a start as a UTC instant, a price in cents, a status code).
 *
 * (1) THE EVENT'S OWN OFFICIAL PAGE IS THE AUTHORITY: the organiser's page, the venue's page, or the ticket seller it links
 *     to. A single official page is NOT a conflict: where ours differs, ours is corrected to the page's own words (and the
 *     caller re-reads to prove it). A listing read from a council or tourism site is not official; where an official page
 *     states the fact, the listing is re-sourced to it. One official site speaks once, however many of its pages say it.
 * (2) HOLD ONLY WHAT STAYS IN DOUBT: official pages that disagree, or no official page readable. A price or a status is held
 *     as a FACT (the price withheld, the night stays); a start, venue or session in doubt holds the NIGHT.
 * (3) A listing whose official page cannot be read is held until one is found and read.
 */

/** Where a reading came from: the official kinds in the order of authority, then a council or tourism listing. */
export type SourceKind = 'organiser' | 'seller' | 'venue' | 'listing'
const AUTHORITY: readonly SourceKind[] = ['organiser', 'seller', 'venue', 'listing']
const OFFICIAL = new Set<SourceKind>(['organiser', 'seller', 'venue'])

/** One page's statement of the fact: its value, or null when the page could not be read or does not state it. */
export type Reading = { kind: SourceKind; url: string; value: string | null }

export type Field = 'start' | 'session' | 'venue' | 'price' | 'status'
export type HoldScope = 'fact' | 'night'
export type HoldReason =
  /** Official pages state different values. */
  | 'officials_disagree'
  /** No official page states the fact (unreadable, robots.txt forbids, a PDF, or only a listing site states it). */
  | 'no_official_page'

export type Resolution =
  | { kind: 'keep'; value: string; by: Reading[] }
  | { kind: 'correct'; value: string; by: Reading[] }
  | { kind: 'resource'; value: string; corrected: boolean; to: Reading; by: Reading[] }
  | { kind: 'hold'; scope: HoldScope; reason: HoldReason; readings: Reading[] }

/** A price or a status is held as a fact, the night stays; a start, venue or session in doubt holds the night. */
export function holdScope(field: Field): HoldScope {
  return field === 'price' || field === 'status' ? 'fact' : 'night'
}

/**
 * A council or tourism listing, never an official page: a government site, a visitor site, a city's what's on. Every other
 * page the engine reads a listing from is the venue's or the organiser's own, or a seller they link to.
 */
export function isListingSite(url: string): boolean {
  const host = sourceHostOf(url) ?? ''
  return /\.gov\.au$/.test(host) || /^visit[a-z]/.test(host) || /(^|\.)whatson\./.test(host)
}

const rank = (k: SourceKind) => AUTHORITY.indexOf(k)

export function resolveFact(input: { field: Field; stored: string; ownUrl: string; readings: readonly Reading[] }): Resolution {
  const { field, stored, ownUrl, readings } = input
  const ownHost = sourceHostOf(ownUrl)
  /* One voice per official site: its most authoritative page that states the fact. */
  const bySite = new Map<string, Reading>()
  for (const reading of [...readings].filter((x) => OFFICIAL.has(x.kind)).sort((a, b) => rank(a.kind) - rank(b.kind))) {
    const host = sourceHostOf(reading.url)
    if (!host || reading.value === null || bySite.has(host)) continue
    bySite.set(host, reading)
  }
  const voices = [...bySite.values()]
  if (voices.length === 0) return { kind: 'hold', scope: holdScope(field), reason: 'no_official_page', readings: [...readings] }
  const values = [...new Set(voices.map((v) => v.value as string))]
  if (values.length > 1) return { kind: 'hold', scope: holdScope(field), reason: 'officials_disagree', readings: [...readings] }

  const value = values[0]
  const ownStates = ownHost !== null && bySite.has(ownHost) && !isListingSite(ownUrl)
  if (!ownStates) {
    const to = [...voices].sort((a, b) => rank(a.kind) - rank(b.kind))[0]
    return { kind: 'resource', value, corrected: value !== stored, to, by: voices }
  }
  return value === stored ? { kind: 'keep', value, by: voices } : { kind: 'correct', value, by: voices }
}
