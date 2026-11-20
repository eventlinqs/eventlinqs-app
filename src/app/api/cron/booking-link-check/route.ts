import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { politeLinkDeps, runLinkCheck } from '@/lib/events/link-check-run'
import { recordPhaseRun } from '@/lib/ops/phase-runs'

export const dynamic = 'force-dynamic'

/**
 * Cron route: the daily booking link check (the project manager's 12:30 of 27 October 2026, point 5;
 * src/lib/events/link-check.ts). Reads every booking link of an event still to come, its robots.txt first, and writes
 * back only what the page itself says: gone, sold out, not yet or on sale, and its price. Protected by CRON_SECRET, as
 * every cron route is.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  // THE TIMETABLE'S VERIFY PHASE, MEASURED (the PM's 04:51 of 20 November 2026: verify, 04:20 to 04:40, had no row,
  // because no run it rides fired in its window and this one recorded nothing). It runs at 04:20 Melbourne
  // (src/lib/ops/timetable.ts RIDES.linkCheck) and records each run, a failed one too, so no phase is silent.
  const runStarted = new Date()
  const record = (units: number, result: string, failed: boolean) =>
    recordPhaseRun(createAdminClient(), { phase: 'verify', ride: 'linkCheck', startedAt: runStarted, endedAt: new Date(), units, result, failed })
  try {
    // Law 14 (k): one request a second per host, a host stopped at its first 403 or 429 (its links could not be checked,
    // never dead), Ticketmaster never read by robot.
    const reader = politeLinkDeps()
    const summary = await runLinkCheck(createAdminClient(), reader, runStarted)
    const stopped = reader.stopped()
    console.log(
      `[cron/booking-link-check] links=${summary.links} changed=${summary.changed} confirmed=${summary.confirmed} robots=${summary.robots} unknown=${summary.unknown} failed=${summary.failed} stopped=${stopped.join(',') || 'none'}`,
    )
    await record(summary.links, `${summary.links} booking link(s) read, ${summary.changed} changed, ${summary.confirmed} prices confirmed, ${summary.robots} refused by robots.txt, ${summary.unknown} unknown, ${summary.failed} failed; hosts stopped: ${stopped.join(', ') || 'none'}`, false)
    return NextResponse.json({ ok: true, ...summary, stopped })
  } catch (err) {
    await record(0, `the booking link check failed: ${err instanceof Error ? err.message : String(err)}`, true)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
