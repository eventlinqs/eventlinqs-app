import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { routeAlerts } from '@/lib/health/runner'
import { runVisitorSentinel } from '@/lib/health/visitor-sentinel-run'
import { politeLinkDeps, runLinkCheck } from '@/lib/events/link-check-run'
import { recordSentinelRun } from '@/lib/health/sentinel-runs'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * THE VISITOR SENTINEL (the controller's 16:43 of 1 November 2026; Lawal: nothing may break tomorrow or after). Every 6
 * hours it reads the live home page and every guide city's page as a visitor would and fails on what a visitor would
 * meet that is untrue: an ended night, a night of another city, a night with no working booking link, a placeholder
 * cover drawn as a photograph, a dead internal link (src/lib/health/visitor-sentinel.ts). Failures alarm the founder
 * through the health router, deduped, the same run. Read only; cron authed (Bearer CRON_SECRET), fail closed.
 *
 *   ?dry=1   judge and report, send nothing.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  const dry = request.nextUrl.searchParams.get('dry') === '1'

  // A real run heals a dead link its source moved (src/lib/events/link-check-run.ts healCandidates), holds a night still
  // dead after this run's own re-read, and releases one whose link answers again (src/lib/health/dead-link-hold.ts, since
  // 26 November 2026 in one run); ?dry=1 judges and writes nothing.
  // A dead night's whole host is re-read at once through the polite link check before any night is judged.
  const db = createAdminClient()
  const results = await runVisitorSentinel({
    db,
    base: getSiteUrl(),
    write: !dry,
    reread: (hosts) => runLinkCheck(db, politeLinkDeps(), new Date(), { onlyHosts: hosts }),
  })
  const failing = results.filter((r) => !r.ok)

  let alerted = false
  if (!dry) {
    try {
      alerted = (await routeAlerts(results, { everyMinutes: 360 })).alerted
    } catch (err) {
      console.error('[visitor-sentinel] alert routing failed:', err instanceof Error ? err.message : err)
    }
  }
  // Every run is kept, a dry one marked dry, so /admin/health shows what the last run found and every report can quote it
  // (src/lib/health/sentinel-runs.ts). A run that cannot be kept still judged and alerted; it says so.
  let stored = 'not stored'
  try {
    stored = await recordSentinelRun(db, results, new Date(), dry)
  } catch (err) {
    stored = `not stored: ${err instanceof Error ? err.message : String(err)}`
  }
  if (stored !== 'stored') console.error('[visitor-sentinel] run', stored)
  return NextResponse.json(
    { ok: failing.length === 0, failing: failing.map((r) => ({ id: r.id, detail: r.detail })), judged: results.length, alerted, dry, stored },
    { status: failing.length === 0 ? 200 : 503 },
  )
}
