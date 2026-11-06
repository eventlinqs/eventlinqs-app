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

/** Readers every source passes through: a change to one opens a canary on every source read automatically. */
export const SHARED_READERS = ['src/lib/listings/collect.ts', 'src/lib/listings/stated-words.ts']
const PAGE_RULES = /^src\/lib\/listings\/page-rules[^/]*\.ts$/

const hostOf = (u: string): string | null => {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * OPENING: the sources a deploy's reader change opens a canary on, in the order given. A shared reader serves every
 * 'read' source; a page rules file serves the hosts it names (each "host: '...'" in its text, given as ruleTexts by path).
 * A source a person decides ('ask', 'never') never needs one. Pure.
 */
export function canarySourcesFor(
  changedFiles: readonly string[],
  sources: readonly { id: string; page_url: string; collection: string }[],
  ruleTexts: Readonly<Record<string, string>>,
): string[] {
  const read = sources.filter((s) => s.collection === 'read')
  if (changedFiles.some((f) => SHARED_READERS.includes(f))) return read.map((s) => s.id)
  const hosts = new Set<string>()
  for (const f of changedFiles.filter((p) => PAGE_RULES.test(p))) {
    for (const m of (ruleTexts[f] ?? '').matchAll(/host:\s*'([^']+)'/g)) hosts.add(m[1].replace(/^www\./, ''))
  }
  return read.filter((s) => hosts.has(hostOf(s.page_url) ?? '')).map((s) => s.id)
}

/** The policy's observation: at least 6 hours, and one full refresh cycle (a successful read after opening). */
export const CANARY_HOURS = 6

/**
 * CLOSING: the canary has run its course and its published tenth is right: at least CANARY_HOURS since opening, a
 * successful read of the source since then, and every canary night the verifier judged is PASS, with at least one
 * judged (nothing judged proves nothing). Pure.
 */
export function canaryMayClose(c: { openedAt: string; lastSuccessAt: string | null; now: string; verdicts: readonly string[] }): boolean {
  const opened = new Date(c.openedAt).getTime()
  if (new Date(c.now).getTime() - opened < CANARY_HOURS * 3_600_000) return false
  if (!c.lastSuccessAt || new Date(c.lastSuccessAt).getTime() <= opened) return false
  return c.verdicts.length > 0 && c.verdicts.every((v) => v === 'PASS')
}
