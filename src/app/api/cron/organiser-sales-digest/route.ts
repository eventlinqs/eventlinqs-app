import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runOrganiserSalesDigest } from '@/lib/notifications/organiser-sales-digest'

export const dynamic = 'force-dynamic'

/**
 * Cron route: the organiser's daily sales digest. Close-out MONEY FIX B4.
 *
 * `daily` is the DEFAULT sales notification mode, so this route is what makes
 * the default mean anything. Without it an organiser hears about the first sale
 * on an event and then nothing ever again, which is a quieter version of the
 * defect the whole item exists to end.
 *
 * ONCE A DAY, AFTER THE PLATFORM DAY HAS CLOSED. It reports the day that has
 * just finished in PLATFORM_TIME_ZONE, so it must run after that day's last
 * order can be confirmed. 07:10 UTC is 17:10 or 18:10 in Melbourne depending on
 * daylight saving, comfortably inside the following platform day, and the ten
 * minute offset keeps it off the hour where five other crons already sit.
 *
 * SAFE TO RUN TWICE. The sweep claims each (organisation, day) by primary key
 * before it sends, so a retry conflicts and sends nothing.
 *
 * Protected by CRON_SECRET, like every other cron route here.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const adminClient = createAdminClient()

  try {
    const summary = await runOrganiserSalesDigest(adminClient)
    console.log('[cron/organiser-sales-digest]', JSON.stringify(summary))
    return NextResponse.json({ ok: true, ...summary, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[cron/organiser-sales-digest] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
