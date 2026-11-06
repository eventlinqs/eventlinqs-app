/**
 * LAW 19 SECTION 7.4, THE RECORDS CANARY (C:\dev\GROWTH\RELEASE-POLICY-5NOV.md 2.2.4: 'a production canary: one source, or at
 * most 10% of that source's records, live through one full refresh cycle and at least 6 hours before it widens'; the design:
 * C:\dev\EVIDENCE\ENGINE-P0\law19-section7-status.md, '7.4, the design to build').
 *
 * A source's canary is open while listing_sources.canary_opened_at is set (migration 20261106170001, prepared for Lawal).
 * While it is open, the hunt's or a partner's rule publishes only the records in its tenth, chosen by a stable hash of the
 * record's own key (source, page, start: the key listing_candidates is unique on), so every run picks the same records
 * and a person can see which; every other record waits for a person with the reason canary_hold. The verifier compares
 * the published tenth with its pages; when it passes after at least 6 hours and a successful read, the canary closes and
 * the held rows are decided by the rule. Pure.
 */
export type CanaryKey = { sourceId: string; pageUrl: string; startsAt: string }
export type SourceCanary = { openedAt: string; release: string } | null

/** FNV-1a, 32 bit: stable across runs, machines and Node versions, unlike any random or time-seeded choice. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** The record is in the canary's tenth: the only records a rule may publish while the source's canary is open. */
export function inCanaryTenth(key: CanaryKey): boolean {
  return fnv1a(`${key.sourceId}|${key.pageUrl}|${new Date(key.startsAt).toISOString()}`) % 10 === 0
}

export function canaryOpen(source: { canary?: SourceCanary }): boolean {
  return Boolean(source.canary && source.canary.openedAt)
}
