import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { runAllChecks, overallStatus } from '@/lib/health/checks'
import { routeAlerts } from '@/lib/health/runner'
import { recordSentinelRun } from '@/lib/health/sentinel-runs'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * PLATFORM HEALTH SENTINEL (docs/ops/HEALTH-ALERTS.md).
 *
 * The founder is the FIRST to know when anything breaks. Runs the full check
 * battery (payment, database, email, storage, maps, AI, push, primary pages,
 * SSL/domain, critical env vars), routes CRITICAL faults to an immediate email
 * and rolls WARNING faults into the daily heartbeat. Deduped so a persisting
 * fault does not spam. Wired to run every few minutes on a Vercel Cron AND
 * after every deployment via post-deploy smoke.
 *
 * Cron-authed (Bearer CRON_SECRET), fail-closed.
 *
 * Query flags (still cron-authed):
 *   ?dry=1        - run checks, DO NOT send any email (green-run proof).
 *   ?drill=<id>   - force one check to fail to prove the alert path lands.
 *                   <id> ∈ payment|database|email|storage|maps|ai|push|pages|ssl|env|all
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const drill = request.nextUrl.searchParams.get('drill') || undefined

  const results = await runAllChecks({ drill })
  const status = overallStatus(results)
  // EVERY RUN IS KEPT WHOLE (P0 of 20 November 2026, the PM's 15:41): the next critical is named from this table, and
  // the admin reads the newest run instead of running the whole battery inside a page. A drill is never kept: its
  // forced failure is not the platform's state. A failed write is said in the answer and never stops the alerts.
  let stored = 'a drill is not kept'
  if (!drill) {
    try {
      stored = await recordSentinelRun(createAdminClient(), results, new Date(), dry, 'platform')
    } catch (err) {
      stored = `not stored: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  let alerted = false
  let toAlertIds: string[] = []
  let recovered: string[] = []
  if (!dry) {
    try {
      const routed = await routeAlerts(results)
      alerted = routed.alerted
      toAlertIds = routed.toAlertIds
      recovered = routed.recovered
    } catch (err) {
      console.error('[health-sentinel] alert routing failed:', err)
    }
  }

  const httpStatus = status === 'critical' ? 503 : 200
  return NextResponse.json(
    {
      ok: status === 'green',
      status,
      statusPage: `${getSiteUrl()}/admin/health`,
      checkedAt: new Date().toISOString(),
      alerted,
      toAlertIds,
      recovered,
      stored,
      dry,
      drill: drill ?? null,
      checks: results,
    },
    { status: httpStatus },
  )
}
