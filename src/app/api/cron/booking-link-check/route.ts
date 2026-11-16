import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { politeLinkDeps, runLinkCheck } from '@/lib/events/link-check-run'

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
  try {
    // Law 14 (k): one request a second per host, a host stopped at its first 403 or 429 (its links could not be checked,
    // never dead), Ticketmaster never read by robot.
    const reader = politeLinkDeps()
    const summary = await runLinkCheck(createAdminClient(), reader, new Date())
    const stopped = reader.stopped()
    console.log(
      `[cron/booking-link-check] links=${summary.links} changed=${summary.changed} robots=${summary.robots} unknown=${summary.unknown} failed=${summary.failed} stopped=${stopped.join(',') || 'none'}`,
    )
    return NextResponse.json({ ok: true, ...summary, stopped })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
