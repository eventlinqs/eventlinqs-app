import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'
import planJson from '../../../../../growth/plan.json'

export const dynamic = 'force-dynamic'

/**
 * Cron route: keep today's growth scorecard (Law 8; the CONTROLLER's 1 November 2026 03:32 G2). Once a day it calls
 * growth_scorecard_snapshot(plan version), which stores growth_scorecard_read() (the one definition WINDOW 6's laptop
 * scorecard also runs) as Melbourne's row for the day, so /admin/growth can show the weekly trend. A second call the
 * same day replaces that day's row. Scheduled at 00:15 UTC in vercel.json: 11:15 in Melbourne while daylight saving
 * lasts, 10:15 after it ends, both before the founder's 11:40 email. Sends nothing. Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const version = (planJson as { version: number }).version
    const { data, error } = await createAdminClient().rpc('growth_scorecard_snapshot', { p_plan_version: version })
    if (error) throw new Error(error.message)
    console.log(`[cron/growth-scorecard] kept ${data?.day} plan version ${version}`)
    return NextResponse.json({ ok: true, day: data?.day ?? null, plan_version: version })
  } catch (error) {
    captureException(error, { where: 'api/cron/growth-scorecard' })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
