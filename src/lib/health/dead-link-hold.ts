/**
 * THE AUTOMATIC HOLD FOR A DEAD BOOKING LINK (the PM's 12:15 item 3 and 12:35 item 4 of 16 November 2026, on Lawal's
 * 12:13 and 12:21: "This engine must learn to autocorrect itself and never repeat the same errors ever"). The Cannonball
 * night at The JazzLab stayed public for a day with its one booking page gone: the daily link check marked the link dead
 * (src/lib/events/link-check.ts, a 404 or 410 only), the visitor sentinel emailed CRITICAL twice, and nothing took the
 * night down. Now the sentinel itself, on its own schedule (vercel.json, every 6 hours at 40 past), judges EVERY
 * published upcoming night, not only those on the pages it reads, and:
 *   holds a public night whose every booking link is dead and was already dead on its previous run (marked at least
 *   SEEN_EARLIER_HOURS ago): the resolver's own night hold, so the night is private and one listing_holds row records why
 *   (field status, reason no_official_page, the dead links as its readings), never deleted;
 *   releases a hold it made the moment one of the night's links answers again (the link check reads a dead link afresh
 *   every day, src/lib/events/link-check.ts), and the night is public again;
 *   names both in its CRITICAL email. Pure: src/lib/health/visitor-sentinel-run.ts reads and writes.
 */

/** The sentinel runs every 6 hours; a link marked dead at least 5 hours ago was dead on the run before this one. */
export const SEEN_EARLIER_HOURS = 5

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

/** Public nights with every link dead that are not yet held: found on this run only, held on the next if still dead. */
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
