import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { routeAlerts } from '@/lib/health/runner'
import { runVisitorSentinel } from '@/lib/health/visitor-sentinel-run'
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

  const results = await runVisitorSentinel({ db: createAdminClient(), base: getSiteUrl() })
  const failing = results.filter((r) => !r.ok)

  let alerted = false
  if (!dry) {
    try {
      alerted = (await routeAlerts(results)).alerted
    } catch (err) {
      console.error('[visitor-sentinel] alert routing failed:', err instanceof Error ? err.message : err)
    }
  }
  return NextResponse.json(
    { ok: failing.length === 0, failing: failing.map((r) => ({ id: r.id, detail: r.detail })), judged: results.length, alerted, dry },
    { status: failing.length === 0 ? 200 : 503 },
  )
}
