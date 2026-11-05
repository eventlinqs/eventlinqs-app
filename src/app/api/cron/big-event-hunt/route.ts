import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runCollection } from '@/lib/listings/collect-run'
import { collectionStore } from '@/lib/listings/collect-store'
import { huntDay, type HuntCityLog } from '@/lib/listings/headline-hunt-day'
import { HUNT_PAGE_CAP, huntOrder } from '@/lib/listings/headline-hunt'

export const dynamic = 'force-dynamic'

// Vercel ends a function at its maximum duration, 300 s by default with fluid compute
// (https://vercel.com/docs/functions/configuring-functions/duration); no source is started in the last minute.
export const maxDuration = 300
const RUN_BUDGET_MS = (maxDuration - 60) * 1000

/**
 * THE DAILY BIG EVENT HUNT (car 44; Lawal's ruling of 4 November 2026, 15:12; the CONTROLLER's 15:20, 15:30 and 22:25b:
 * 'Its daily schedule: 05:00 and 15:00 Melbourne time'; vercel.json fires it at 18:00 and 04:00 UTC, which is 05:00 and
 * 15:00 in Melbourne in daylight saving time, AEDT, UTC+11). It reads every headline venue's own What's on page on the
 * hunt's list (src/lib/listings/headline-hunt.ts) whatever its pace, through the collection run itself (robots first, one
 * page a second, a stop at 403 or 429), lists a new night each states at its own venue (the hunt's rule), and logs, per
 * city, the new big events found and every upcoming night by tier (law 18).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const started = Date.now()
    const db = createAdminClient()
    const store = collectionStore(db)
    // Only the hunt's sources, each due now, the one read longest ago first (huntOrder): the hunt reads them at its two
    // times whatever their own pace, and a source one run's time ran out before is read first by the next.
    const hunt = { ...store, sources: async () => huntOrder(await store.sources()) }
    const result = await runCollection(hunt, fetch, new Date(started), started + RUN_BUDGET_MS, { pageCap: HUNT_PAGE_CAP })
    const byCity: HuntCityLog[] = await huntDay(db, result, new Date(started))
    for (const c of byCity) {
      console.log(
        `[cron/big-event-hunt] ${c.citySlug}: ${c.newBigEvents} new big event(s) listed, ${c.waiting} waiting for a person; ` +
          `upcoming by tier: 1 ${c.upcomingByTier[1]}, 2 ${c.upcomingByTier[2]}, 3 ${c.upcomingByTier[3]}, 4 ${c.upcomingByTier[4]}`,
      )
    }
    for (const s of result.sources) console.log(`[cron/big-event-hunt] ${s.name}: ${s.outcome}`)
    return NextResponse.json({ ok: true, ...result, byCity })
  } catch (err) {
    console.error('[cron/big-event-hunt] failed:', err)
    return NextResponse.json({ error: 'the big event hunt failed' }, { status: 500 })
  }
}
