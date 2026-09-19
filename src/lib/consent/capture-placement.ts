import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { captureException } from '@/lib/observability/sentry'
import {
  CAPTURE_PLACEMENTS,
  DEFAULT_CAPTURE_PLACEMENT,
  isCapturePlacement,
  type CapturePlacement,
  type PlacementPeriod,
  placementPeriodsFrom,
  placementInForceAt,
} from './capture-placement-math'

type Admin = SupabaseClient<Database>

export {
  CAPTURE_PLACEMENTS,
  DEFAULT_CAPTURE_PLACEMENT,
  isCapturePlacement,
  placementPeriodsFrom,
  placementInForceAt,
}
export type { CapturePlacement, PlacementPeriod }

export interface PlacementDecision {
  id: string
  placement: CapturePlacement
  effectiveFrom: string
  reason: string
}

/**
 * WHERE THE DISCOVERY QUESTION IS ASKED. ONE RESOLVER, READ BY EVERY SURFACE.
 *
 * AQ1's reversal condition is "a conversion fall greater than two percent moves
 * the capture off checkout, it does not remove it". A reversal that has to be
 * deployed is not a reversal, and a second surface that decides for itself
 * whether to ask is how the same question gets asked twice. So the placement is
 * a row in an append only decision log and this is the only thing that reads it.
 *
 * WHAT A FAILURE ANSWERS, AND WHY IT IS CHECKOUT. The last resort is the
 * placement the platform has always used, matching the fee resolver's posture:
 * a transient outage may not silently move a surface. It can never ask twice,
 * because both surfaces ask this same function and there is exactly one answer
 * per request.
 */
export async function resolveCapturePlacement(admin: Admin): Promise<CapturePlacement> {
  const decision = await currentPlacementDecision(admin)
  return decision?.placement ?? DEFAULT_CAPTURE_PLACEMENT
}

/** The decision in force now, with the reason it was taken. Null if unreadable. */
export async function currentPlacementDecision(admin: Admin): Promise<PlacementDecision | null> {
  try {
    const { data, error } = await admin
      .from('marketing_capture_placement')
      .select('id, placement, effective_from, reason')
      .lte('effective_from', new Date().toISOString())
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    if (!isCapturePlacement(data.placement)) return null
    return {
      id: data.id,
      placement: data.placement,
      effectiveFrom: data.effective_from,
      reason: data.reason,
    }
  } catch (error) {
    captureException(error, { where: 'lib/consent/capture-placement:currentPlacementDecision' })
    return null
  }
}

/**
 * THE WHOLE HISTORY, OLDEST FIRST. The conversion measurement needs it: a
 * reservation belongs to the placement that was in force when it was created,
 * and only the history can say which that was.
 *
 * Read through readEveryRow because a bounded read of a log that decides a
 * measurement is a measurement that silently changes answer at a thousand rows.
 */
export async function readPlacementHistory(admin: Admin): Promise<PlacementDecision[]> {
  const rows = await readEveryRow('marketing_capture_placement', (from, to) =>
    admin
      .from('marketing_capture_placement')
      .select('id, placement, effective_from, reason')
      .order('effective_from', { ascending: true })
      .range(from, to),
  )
  return rows
    .filter((row): row is typeof row & { placement: CapturePlacement } =>
      isCapturePlacement(row.placement),
    )
    .map(row => ({
      id: row.id,
      placement: row.placement,
      effectiveFrom: row.effective_from,
      reason: row.reason,
    }))
}

/**
 * MOVE THE CAPTURE. The reversal condition, executed.
 *
 * It appends; it never edits. Writing a new row is what the reversal IS, and it
 * is also what keeps the conversion measurement honest: the line a rate is
 * measured either side of cannot be moved after the fact, because the database
 * refuses the update.
 */
export async function recordPlacementDecision(
  admin: Admin,
  params: { placement: CapturePlacement; reason: string; decidedBy?: string | null },
): Promise<{ ok: boolean; reason: string }> {
  const reason = params.reason.trim()
  if (!reason) {
    return { ok: false, reason: 'a placement with no stated reason cannot be argued with later' }
  }
  try {
    const { error } = await admin.from('marketing_capture_placement').insert({
      placement: params.placement,
      reason,
      decided_by: params.decidedBy ?? null,
    })
    if (error) return { ok: false, reason: error.message }
    return { ok: true, reason: `the question is now asked on the ${params.placement} surface` }
  } catch (error) {
    captureException(error, { where: 'lib/consent/capture-placement:recordPlacementDecision' })
    return { ok: false, reason: 'the decision could not be written' }
  }
}
