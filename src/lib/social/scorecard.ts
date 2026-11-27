import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * THE SCORECARD AND THE PUBLISHING RELIABILITY COUNT (Lawal, 02:04 and 02:14 of 28 November 2026; the PM's 02:12, car U,
 * U3 and U4; START-16OCT/EVENTLINQS-SOCIAL-SCORECARD-AND-CONVERSION-28NOV.md sections 1 and 5).
 *   - Each studio piece carries its scorecard (studio_pieces.scorecard, migration 20261128040001): the eight measures, each
 *     out of 10, as the engine scored it and as the PM scored it, with what each looked at. The floor is 9 on every measure.
 *   - The running count of approved posts published on time and verified within ten minutes of their slot: a miss resets it,
 *     and reliability is "demonstrated" at five in a row.
 * Pure, but for the one reader at the end.
 */

/** The eight measures, in the standard's order. */
export const MEASURES = [
  { key: 'brand_identity', name: 'Brand identity' },
  { key: 'creative_direction', name: 'Creative direction' },
  { key: 'visual_consistency', name: 'Visual consistency' },
  { key: 'mobile_readability', name: 'Mobile readability' },
  { key: 'event_hierarchy', name: 'Event information hierarchy' },
  { key: 'conversion_readiness', name: 'Conversion readiness' },
  { key: 'production_workflow', name: 'Production workflow' },
  { key: 'publishing_reliability', name: 'Publishing reliability' },
] as const

/** The floor on every measure (Lawal, 02:14: "The floor is 9 on EVERY measure"). */
export const SCORE_FLOOR = 9

export type ScoreRow = { readonly key: string; readonly name: string; readonly engine: number | null; readonly pm: number | null; readonly below: boolean }

const scoreOf = (side: unknown, key: string): number | null => {
  const v = side !== null && typeof side === 'object' ? (side as Record<string, unknown>)[key] : null
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10 ? v : null
}

/** The scorecard as /admin/social shows it: each measure's engine and PM score, and whether either is under the floor. Pure. */
export function scoreRows(scorecard: unknown): ScoreRow[] {
  const card = scorecard !== null && typeof scorecard === 'object' ? (scorecard as Record<string, unknown>) : {}
  return MEASURES.map((m) => {
    const engine = scoreOf(card.engine, m.key)
    const pm = scoreOf(card.pm, m.key)
    return { key: m.key, name: m.name, engine, pm, below: [engine, pm].some((s) => s !== null && s < SCORE_FLOOR) }
  })
}

/** A slot is on time when it published and was read back within this long of its time (section 5). */
export const ON_TIME_MS = 10 * 60 * 1000
/** Reliability is demonstrated at this many in a row (section 5). */
export const DEMONSTRATED_AT = 5

export type SlotRow = { readonly go_at: string; readonly state: string; readonly published_at: string | null }
export type Reliability = { readonly count: number; readonly demonstrated: boolean; readonly lastMiss: string | null }

/**
 * The running count, oldest slot first: a slot whose ten minutes have passed counts when it published within them, and
 * any other (held, late, or not read back) is a miss that resets the count to nought. A slot still inside its ten minutes
 * is not judged yet. Pure.
 */
export function reliabilityOf(rows: readonly SlotRow[], now: Date): Reliability {
  let count = 0
  let lastMiss: string | null = null
  const judged = rows.filter((r) => Date.parse(r.go_at) + ON_TIME_MS <= now.getTime()).sort((a, b) => Date.parse(a.go_at) - Date.parse(b.go_at))
  for (const r of judged) {
    const onTime = r.state === 'published' && r.published_at !== null && Date.parse(r.published_at) - Date.parse(r.go_at) <= ON_TIME_MS
    if (onTime) count += 1
    else {
      count = 0
      lastMiss = r.go_at
    }
  }
  return { count, demonstrated: count >= DEMONSTRATED_AT, lastMiss }
}

/** The count's one line, for /admin/social and the evening check. Pure. */
export function reliabilityLine(r: Reliability): string {
  return `publishing reliability: ${r.count} approved post${r.count === 1 ? '' : 's'} in a row published on time and verified within ten minutes${r.demonstrated ? ' (demonstrated)' : ` (demonstrated at ${DEMONSTRATED_AT})`}`
}

/** Every approved slot of the last sixty days, both networks. A read that fails throws. */
export async function readReliability(db: SupabaseClient, now: Date): Promise<Reliability> {
  const r = await db.from('social_piece_schedules').select('go_at, state, published_at').gte('go_at', new Date(now.getTime() - 60 * 86_400_000).toISOString()).order('go_at').limit(2000)
  if (r.error) throw new Error(`the approved slots could not be read: ${r.error.message}`)
  return reliabilityOf((r.data ?? []) as SlotRow[], now)
}
