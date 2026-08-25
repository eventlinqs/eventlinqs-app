import { NextResponse, type NextRequest } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DAILY: every stored figure, recounted from the rows it claims to summarise.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * FOUNDER RULING, 25 August 2026:
 *
 *   "A recurring reconciliation that compares every stored figure against a live
 *    recount and reports disagreement. Nine of nine organisations disagree with
 *    their own rows today; I want that number visible, not discovered."
 *
 * The build guard (`scripts/guards/maintained-aggregates.mjs`) stops a NEW
 * unmaintained figure being added. The drive
 * (`scripts/verify/aggregate-drift-drive.mjs`) proves whether a figure follows
 * when the rows beneath it change. Neither answers the only question that
 * matters at four in the morning: how far has the LIVE data already moved?
 *
 * ============================================================================
 * IT REPORTS. IT NEVER REPAIRS.
 * ============================================================================
 *
 * There is no UPDATE anywhere in this route, and that is a decision rather than
 * an omission. A reconciliation that silently corrected a figure would destroy
 * the evidence of how it came to be wrong, and every real finding of the
 * 25 August pass survived precisely because the wrong number was still there to
 * be traced. If this route starts reporting drift where it reported none, the
 * thing to fix is upstream.
 *
 * ============================================================================
 * ONE DEFINITION, TWO CALLERS
 * ============================================================================
 *
 * The recount is `public.stored_aggregate_drift` (migration 20260825000004).
 * This route reads it over PostgREST; `scripts/verify/aggregate-reconcile.mjs`
 * reads the same view over a direct Postgres connection. Writing the recount
 * once per transport is exactly the second-copy shape this whole pass exists to
 * remove.
 *
 * The prose verdict for each column lives in `scripts/lib/stored-aggregates.mjs`,
 * which is a build-time artefact and deliberately NOT imported here: a route
 * should not carry the reasoning, only the number.
 *
 * ============================================================================
 * AUTH AND FAILURE POSTURE
 * ============================================================================
 *
 * CRON_SECRET-gated and fail-closed (`src/lib/cron/auth.ts` refuses when the
 * secret is unset rather than running open), and rate limited like every other
 * cron.
 *
 * A read failure returns 503 rather than 200-with-zero. A reconciliation that
 * answers "no drift" because it could not look is worse than one that does not
 * run, because the first one is believed.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const blocked = await applyRateLimit('cron-job', request)
  if (blocked) return blocked

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('stored_aggregate_drift')
    .select('column_name, key, stored, truth')
    .limit(100000)

  if (error) {
    console.error('[aggregate-reconcile] could not read stored_aggregate_drift:', error)
    return NextResponse.json(
      {
        ok: false,
        error: 'recount_unavailable',
        detail: error.message,
        note: 'This is NOT "no drift". Migration 20260825000004 may not be applied here.',
      },
      { status: 503 },
    )
  }

  const rows = (data ?? []) as { column_name: string; key: string; stored: string; truth: string }[]

  /**
   * Per column: how many entities were compared and how many disagree, with a
   * few examples so the report is actionable rather than a bare number.
   */
  const byColumn = new Map<
    string,
    { checked: number; disagreeing: number; sample: { key: string; stored: string; truth: string }[] }
  >()
  for (const r of rows) {
    let bucket = byColumn.get(r.column_name)
    if (!bucket) {
      bucket = { checked: 0, disagreeing: 0, sample: [] }
      byColumn.set(r.column_name, bucket)
    }
    bucket.checked += 1
    if (String(r.stored) !== String(r.truth)) {
      bucket.disagreeing += 1
      if (bucket.sample.length < 5) {
        bucket.sample.push({ key: r.key, stored: r.stored, truth: r.truth })
      }
    }
  }

  const columns = [...byColumn.entries()]
    .map(([column, v]) => ({ column, ...v }))
    .sort((a, b) => b.disagreeing - a.disagreeing || a.column.localeCompare(b.column))

  const totalRows = columns.reduce((s, c) => s + c.checked, 0)
  const totalDrift = columns.reduce((s, c) => s + c.disagreeing, 0)
  const driftingColumns = columns.filter(c => c.disagreeing > 0)

  /*
   * LOGGED AS WELL AS RETURNED. Nobody reads a cron's response body; the log is
   * where a drift that appeared overnight is actually seen, and the founder
   * alerting channel reads the logs.
   */
  if (totalDrift > 0) {
    console.warn(
      `[aggregate-reconcile] ${totalDrift} row(s) disagree with their own source rows, across ${driftingColumns.length} column(s):`,
      driftingColumns.map(c => `${c.column} ${c.disagreeing}/${c.checked}`).join(', '),
    )
    for (const c of driftingColumns) {
      for (const s of c.sample) {
        console.warn(`[aggregate-reconcile]   ${c.column} ${s.key}: stored ${s.stored}, rows say ${s.truth}`)
      }
    }
  } else {
    console.log(`[aggregate-reconcile] every stored figure agrees with its rows (${totalRows} compared).`)
  }

  /*
   * ZERO COLUMNS IS A FAILURE, NOT A CLEAN RUN. An empty view, a dropped
   * migration or a revoked grant would all otherwise report "0 drift" and read
   * as health. This is the same rule the CI claim contract applies to every step
   * that says it did work.
   */
  if (columns.length === 0) {
    console.error('[aggregate-reconcile] the recount returned NO COLUMNS AT ALL. That is not agreement.')
    return NextResponse.json(
      {
        ok: false,
        error: 'recount_empty',
        note: 'stored_aggregate_drift returned no rows for any column. Check the migration and the service-role grant.',
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    columns,
    totalRows,
    totalDrift,
    driftingColumns: driftingColumns.length,
    note: 'This route reports and never repairs. See scripts/lib/stored-aggregates.mjs for what maintains each figure and what was ruled about it.',
  })
}
