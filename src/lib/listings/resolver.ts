import { sourceHostOf } from './judge'

/**
 * THE RESOLVER'S RULING, ONE FACT AT A TIME (Lawal, 06:21 on 7 November 2026, through the CONTROLLER: 'Any mismatch is not
 * hidden. Any mismatch, you go and verify which is the proper and the best event ... check other sources ... Unless your
 * verification still brings conflict or discrepancies, then you can have it hidden.'). Pure: the reading of the pages is
 * the caller's (through the polite reader and robots.txt), and every value arrives already in one form per fact (a start
 * as a UTC instant, a price in cents, a status code, a venue folded).
 *
 * A mismatch or an unreadable source starts this, never a hide. The event's other authoritative pages are read in the
 * CONTROLLER's order of authority: the organiser's own, the ticket seller's, the venue's, then the listing's own (a council
 * or tourism page). TWO INDEPENDENT PAGES, meaning two different sites, agreeing on a fact decide it: the listing keeps a
 * value they confirm, takes a value they agree on instead, and, when its own page cannot be read, is re-sourced to the
 * most authoritative page of the two. One site alone never decides, however many of its pages say it. Only a conflict
 * that remains, or nothing readable, is quarantined, with its reason: hidden, never deleted, and tried again every run.
 */

/** Where a reading came from, in the order of authority. */
export type SourceKind = 'organiser' | 'seller' | 'venue' | 'listing'
const AUTHORITY: readonly SourceKind[] = ['organiser', 'seller', 'venue', 'listing']

/** One page's statement of the fact: its value, or null when the page could not be read or does not state it. */
export type Reading = { kind: SourceKind; url: string; value: string | null }

export type QuarantineReason =
  /** Two or more sites state the fact and no value has two of them. */
  | 'sources_disagree'
  /** Only one site states the fact: nothing to agree with. */
  | 'single_source'
  /** No authoritative page states the fact. */
  | 'unverifiable'

export type Resolution =
  | { kind: 'keep'; value: string; agreeing: Reading[] }
  | { kind: 'correct'; value: string; agreeing: Reading[] }
  | { kind: 'resource'; value: string; corrected: boolean; to: Reading; agreeing: Reading[] }
  | { kind: 'quarantine'; reason: QuarantineReason; readings: Reading[] }

const rank = (k: SourceKind) => AUTHORITY.indexOf(k)

export function resolveFact(input: { stored: string; ownUrl: string; readings: readonly Reading[] }): Resolution {
  const { stored, ownUrl, readings } = input
  const ownHost = sourceHostOf(ownUrl)
  /* One voice per site: a site's most authoritative page that states the fact. */
  const bySite = new Map<string, Reading>()
  for (const reading of [...readings].sort((a, b) => rank(a.kind) - rank(b.kind))) {
    const host = sourceHostOf(reading.url)
    if (!host || reading.value === null || bySite.has(host)) continue
    bySite.set(host, reading)
  }
  const voices = [...bySite.values()]
  if (voices.length === 0) return { kind: 'quarantine', reason: 'unverifiable', readings: [...readings] }
  if (voices.length === 1) return { kind: 'quarantine', reason: 'single_source', readings: [...readings] }

  const tally = new Map<string, Reading[]>()
  for (const v of voices) tally.set(v.value as string, [...(tally.get(v.value as string) ?? []), v])
  const agreed = [...tally.entries()].filter(([, who]) => who.length >= 2)
  if (agreed.length !== 1) return { kind: 'quarantine', reason: 'sources_disagree', readings: [...readings] }

  const [value, agreeing] = agreed[0]
  const ownReadable = ownHost !== null && bySite.has(ownHost)
  if (!ownReadable) {
    const to = agreeing.filter((a) => sourceHostOf(a.url) !== ownHost).sort((a, b) => rank(a.kind) - rank(b.kind))[0] ?? agreeing[0]
    return { kind: 'resource', value, corrected: value !== stored, to, agreeing }
  }
  return value === stored ? { kind: 'keep', value, agreeing } : { kind: 'correct', value, agreeing }
}
