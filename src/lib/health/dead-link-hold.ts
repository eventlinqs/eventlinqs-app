/**
 * THE AUTOMATIC HOLD FOR A DEAD BOOKING LINK (the PM's 12:15 item 3 and 12:35 item 4 of 16 November 2026, on Lawal's
 * 12:13 and 12:21: "This engine must learn to autocorrect itself and never repeat the same errors ever"). The Cannonball
 * night at The JazzLab stayed public for a day with its one booking page gone: the daily link check marked the link dead
 * (src/lib/events/link-check.ts, a 404 or 410 only), the visitor sentinel emailed CRITICAL twice, and nothing took the
 * night down. Now the sentinel itself, on its own schedule (vercel.json, every 6 hours at 40 past), judges EVERY
 * published upcoming night, not only those on the pages it reads, and:
 *   holds a public night whose every booking link is dead after this run's own re-read and heal (since 26 November
 *   2026 in the same run: SEEN_EARLIER_HOURS below): the resolver's own night hold, so the night is private and one listing_holds row records why
 *   (field status, reason no_official_page, the dead links as its readings), never deleted;
 *   releases a hold it made the moment one of the night's links answers again (the link check reads a dead link afresh
 *   every day, src/lib/events/link-check.ts), and the night is public again;
 *   names both in its CRITICAL email. Pure: src/lib/health/visitor-sentinel-run.ts reads and writes.
 */

/**
 * HELD IN ONE RUN (the PM's 11:53 of 26 November 2026, item 2: "a night whose link dies is healed or taken down within
 * one run, never left live with a dead link"). Until then a night was held only if its links were already dead on the run
 * before (5 hours), so a dead night stayed public for up to six hours and the sentinel emailed Lawal CRITICAL meanwhile
 * (The Greatest Christmas Show, 11:42). The sentinel now re-reads the night's host in the same run before it judges
 * (visitor-sentinel-run.ts), and that re-read heals a link whose source names a new page (link-check-run.ts
 * healCandidates); a night still dead after both is held on that run. A dead link is only ever a 404 or 410 its own page
 * answered (link-check.ts), never a blink, and the hold is released the moment a link answers again.
 */
export const SEEN_EARLIER_HOURS = 0

/** What marks a hold as the sentinel's own, in its readings, so it releases only what it made. */
export const SENTINEL_HOLD_MARK = 'visitor-sentinel: every booking link dead'

export type NightLinks = {
  readonly id: string
  readonly slug: string
  readonly seriesId: string | null
  readonly visibility: string
  readonly links: readonly { readonly url: string; readonly availability: string | null; readonly updatedAt: string }[]
}

export type OpenSentinelHold = { readonly id: string; readonly eventId: string }

/** A night whose every booking link is dead (it has at least one). */
export function everyLinkDead(n: NightLinks): boolean {
  return n.links.length > 0 && n.links.every((l) => l.availability === 'dead')
}

/** Public nights to hold now: every link dead, and dead already on the previous run. */
export function holdsToMake(nights: readonly NightLinks[], openHeld: ReadonlySet<string>, now: Date): NightLinks[] {
  const before = now.getTime() - SEEN_EARLIER_HOURS * 3_600_000
  return nights.filter((n) => n.visibility === 'public' && !openHeld.has(n.id) && everyLinkDead(n) && n.links.every((l) => Date.parse(l.updatedAt) <= before))
}

/** Public nights with every link dead that are not yet held after this run (none, since the hold is made in one run, unless its write failed). */
export function deadNotYetHeld(nights: readonly NightLinks[], openHeld: ReadonlySet<string>, now: Date): NightLinks[] {
  const made = new Set(holdsToMake(nights, openHeld, now).map((n) => n.id))
  return nights.filter((n) => n.visibility === 'public' && !openHeld.has(n.id) && everyLinkDead(n) && !made.has(n.id))
}

/** The sentinel's own holds to release: the night now has a link that is not dead. */
export function holdsToRelease(holds: readonly OpenSentinelHold[], nights: readonly NightLinks[]): OpenSentinelHold[] {
  const byId = new Map(nights.map((n) => [n.id, n]))
  return holds.filter((h) => {
    const n = byId.get(h.eventId)
    return n !== undefined && n.links.some((l) => l.availability !== 'dead')
  })
}

/** A link's host, 'www.' aside; null for an address that does not parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * THE SOURCE THAT PUBLISHES DEAD LINKS IS SWITCHED OFF (the PM's 12:25 item 3 of 16 November 2026, on Lawal's 12:21: 'never
 * repeat the same errors ever'; law 19 (d)). The hosts on which the sentinel held two or more different nights for dead
 * links within seven days, with those nights. Each hold gives the hosts of its dead links (its readings). Pure.
 */
export const DEAD_TWICE_DAYS = 7

/** The words every such stop's reason carries, so the daily state can find the stops of the last day by them. */
export const SOURCE_STOP_WORDS = 'booking links were dead'

/** The stop's reason, written on the source (listing_sources.stopped_because). */
export function sourceStopReason(nights: number): string {
  return `Its ${SOURCE_STOP_WORDS} on ${nights} nights within ${DEAD_TWICE_DAYS} days (the visitor sentinel held each). Law 19 (d): its publication stops until a person reads it and re-opens it.`
}

export function hostsDeadTwice(holds: readonly { eventId: string; urls: readonly string[]; heldAt: string }[], now: Date): Map<string, string[]> {
  const since = now.getTime() - DEAD_TWICE_DAYS * 24 * 3_600_000
  const byHost = new Map<string, Set<string>>()
  for (const h of holds) {
    if (Date.parse(h.heldAt) < since) continue
    for (const u of h.urls) {
      const host = hostOf(u)
      if (!host) continue
      byHost.set(host, (byHost.get(host) ?? new Set()).add(h.eventId))
    }
  }
  return new Map([...byHost.entries()].filter(([, ids]) => ids.size >= 2).map(([host, ids]) => [host, [...ids]]))
}

/** The sources still read automatically whose own page is on such a host: their publication flag switches off. Pure. */
export function sourcesToStop(dead: ReadonlyMap<string, readonly string[]>, sources: readonly { id: string; name: string; page_url: string; collection: string }[]) {
  return sources.filter((s) => s.collection === 'read' && dead.has(hostOf(s.page_url) ?? ''))
}

/** The listing_holds row for a night held for its dead links (supabase/migrations 20261107120001 and 20261107170001). */
export function holdRow(n: NightLinks, now: Date) {
  const readings = n.links.map((l) => ({ by: SENTINEL_HOLD_MARK, url: l.url, availability: l.availability, marked_dead_at: l.updatedAt, read_at: now.toISOString() }))
  return {
    event_id: n.id,
    series_id: n.seriesId,
    field: 'status' as const,
    scope: 'night' as const,
    reason: 'no_official_page' as const,
    readings,
    state: 'held' as const,
    next_source: n.links[0]?.url ?? null,
    next_check_at: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
    sources_tried: readings,
  }
}
