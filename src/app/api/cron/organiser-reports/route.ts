import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { runOrganiserReports } from '@/lib/growth/organiser-report'

export const dynamic = 'force-dynamic'

/**
 * Cron route: the organiser's report after each night (the engine plan of 28 October 2026, part H;
 * src/lib/growth/organiser-report-math.ts). Hourly: every public night that ended at least two days ago gets one report
 * of what EventLinqs counted for it, written once (message 8 of the organiser messages is filled from it). It sends
 * nothing itself. Protected by
 * CRON_SECRET, as every cron route is.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const summary = await runOrganiserReports(new Date())
    console.log(`[cron/organiser-reports] due=${summary.due} written=${summary.written} failed=${summary.failed}`)
    return NextResponse.json({ ok: true, ...summary })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
