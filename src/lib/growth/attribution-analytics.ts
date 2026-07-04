import { isReferralSource, type ReferralSource } from './referrals'

/**
 * Aggregation of signup attribution (the acquisition-loop measurement surface).
 *
 * The acquisition loop records each new profile's first-touch attribution in
 * profiles.metadata.attribution. This pure function turns a set of profile rows
 * into the counts that answer the growth-plan questions: which sources drive
 * signups, and which referrers (and which event links) drive the most. It is
 * pure so it is trivially unit-tested; the data fetch is a thin caller around it.
 */

export type AttributionProfileRow = {
  metadata: unknown
}

export type AttributionSummary = {
  total: number
  attributed: number
  organic: number
  bySource: Record<ReferralSource, number>
  /** referrer profile id -> signups they drove, highest first. */
  topReferrers: Array<{ referredBy: string; signups: number }>
  /** event slug -> signups its shared links drove, highest first. */
  topEvents: Array<{ event: string; signups: number }>
}

function readAttribution(metadata: unknown): {
  source: ReferralSource
  referredBy: string | null
  event: string | null
} | null {
  if (!metadata || typeof metadata !== 'object') return null
  const attribution = (metadata as Record<string, unknown>).attribution
  if (!attribution || typeof attribution !== 'object') return null
  const a = attribution as Record<string, unknown>
  const source = isReferralSource(a.source) ? a.source : 'organic'
  const referredBy = typeof a.referredBy === 'string' ? a.referredBy : null
  const event = typeof a.event === 'string' ? a.event : null
  return { source, referredBy, event }
}

export function summariseAttribution(rows: AttributionProfileRow[]): AttributionSummary {
  const bySource: Record<ReferralSource, number> = {
    'share-a-ticket': 0,
    'organiser-invite': 0,
    organic: 0,
  }
  const referrerCounts = new Map<string, number>()
  const eventCounts = new Map<string, number>()
  let attributed = 0

  for (const row of rows) {
    const a = readAttribution(row.metadata)
    if (!a) {
      bySource.organic += 1
      continue
    }
    bySource[a.source] += 1
    if (a.source !== 'organic') attributed += 1
    if (a.referredBy) referrerCounts.set(a.referredBy, (referrerCounts.get(a.referredBy) ?? 0) + 1)
    if (a.event) eventCounts.set(a.event, (eventCounts.get(a.event) ?? 0) + 1)
  }

  const rank = <K extends string>(m: Map<string, number>, key: K) =>
    [...m.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => ({ [key]: k, signups: v }) as Record<K, string> & { signups: number })

  return {
    total: rows.length,
    attributed,
    organic: bySource.organic,
    bySource,
    topReferrers: rank(referrerCounts, 'referredBy') as AttributionSummary['topReferrers'],
    topEvents: rank(eventCounts, 'event') as AttributionSummary['topEvents'],
  }
}
