/**
 * THE EVENT OPPORTUNITY SCORE, 0 TO 100, THE ARITHMETIC (window 6, 27 October 2026; the locked foundation's item 16,
 * "Event Opportunity Score, 0 to 100 ... Shown in admin; says 'needs two weeks of numbers' until it has them"; its
 * parts as the project manager set them at 21:19, (3): "the Opportunity Score's parts are window 5's five dimensions,
 * the locked plan's own (relevance, attention, engagement, conversion, business health), each 0 to 20, equal weight,
 * per event over the last 14 days against its city and category median").
 *
 * Leaders: no ticketing site publishes such a score (UNSOURCED, the 21:19); this one is built only from counted
 * numbers (src/lib/growth/opportunity.ts reads them).
 *
 * EACH PART, 0 TO 20: an event's number for the dimension against the median of its peers, the events of the same city
 * and category scored with it. At the median it scores 10; at twice the median or more, 20; at none, 0; in between in
 * proportion. Where the peers' median is nothing, an event with anything scores 20 and one with nothing scores 10, at
 * its peers' level. The five parts add to the score.
 *
 * NEEDS TWO WEEKS. An event published fewer than 14 days ago, or not published, has no score, and says so.
 */

export const WINDOW_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export const DIMENSIONS = ['relevance', 'attention', 'engagement', 'conversion', 'health'] as const
export type Dimension = (typeof DIMENSIONS)[number]
export type Raw = Record<Dimension, number>

export type ScoredEvent = { id: string; city: string | null; category: string | null; publishedAt: string | null }
export type Scored =
  | { id: string; state: 'scored'; score: number; parts: Record<Dimension, number>; raw: Raw }
  | { id: string; state: 'needs_two_weeks' }

/** One part, 0 to 20, of a number against its peers' median. */
export function partOf(value: number, median: number): number {
  if (median <= 0) return value > 0 ? 20 : 10
  return Math.max(0, Math.min(20, Math.round((10 * value) / median)))
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Whether an event has two weeks of numbers behind it at `now`. */
export function hasTwoWeeks(publishedAt: string | null, now: Date): boolean {
  if (!publishedAt) return false
  const at = new Date(publishedAt).getTime()
  return Number.isFinite(at) && at <= now.getTime() - WINDOW_DAYS * DAY_MS
}

/** Scores every event against its own city and category peers; events without two weeks of numbers are not scored. */
export function scoreEvents(events: readonly ScoredEvent[], raws: ReadonlyMap<string, Raw>, now: Date): Scored[] {
  const ready = events.filter((e) => hasTwoWeeks(e.publishedAt, now))
  const peersOf = new Map<string, ScoredEvent[]>()
  const key = (e: ScoredEvent) => `${e.city ?? ''}|${e.category ?? ''}`
  for (const e of ready) {
    const k = key(e)
    if (!peersOf.has(k)) peersOf.set(k, [])
    peersOf.get(k)?.push(e)
  }
  const zero: Raw = { relevance: 0, attention: 0, engagement: 0, conversion: 0, health: 0 }
  const rawOf = (id: string): Raw => raws.get(id) ?? zero
  return events.map((e) => {
    if (!hasTwoWeeks(e.publishedAt, now)) return { id: e.id, state: 'needs_two_weeks' }
    const peers = peersOf.get(key(e)) ?? [e]
    const raw = rawOf(e.id)
    const parts = Object.fromEntries(DIMENSIONS.map((d) => [d, partOf(raw[d], median(peers.map((p) => rawOf(p.id)[d])))])) as Record<Dimension, number>
    return { id: e.id, state: 'scored', score: DIMENSIONS.reduce((n, d) => n + parts[d], 0), parts, raw }
  })
}
