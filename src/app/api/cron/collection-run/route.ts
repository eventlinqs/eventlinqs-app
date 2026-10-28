import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runCollection } from '@/lib/listings/collect-run'
import { collectionStore } from '@/lib/listings/collect-store'

export const dynamic = 'force-dynamic'

// Declared, as listing-occurrences does: Vercel ends a function at its maximum duration, 300 s by default with fluid
// compute (https://vercel.com/docs/functions/configuring-functions/duration). No source is started in the last minute.
export const maxDuration = 300
const RUN_BUDGET_MS = (maxDuration - 60) * 1000

/**
 * THE DAILY COLLECTION RUN (item 19; the engine plan of 28 October 2026, part A; src/lib/listings/collect.ts,
 * docs/walk-in/COLLECTION-RUN.md). 19:00 UTC every day, 6 am in Melbourne in daylight time and 5 am in standard time,
 * so the exception queue is ready each morning. Each source is still read only on its own pace (daily, weekly,
 * monthly or rarely).
 *
 * Reads only the register's sources whose own terms allow it, where robots.txt allows the page, and only the page's own
 * Event data. A high confidence find from a partner's own verified feed is accepted by the partner rule; everything
 * else waits on /admin/collected. Every source's run is logged (listing_source_runs).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const started = Date.now()
    const result = await runCollection(collectionStore(createAdminClient()), fetch, new Date(started), started + RUN_BUDGET_MS)
    console.log(
      `[cron/collection-run] ${result.read} source(s) read, ${result.skipped} not read, ${result.landed} event(s) new: ` +
        `${result.acceptedByRule} accepted by the partner rule, ${result.queued} for review` +
        (result.notReached > 0 ? `; ${result.notReached} source(s) not reached inside the budget, still due` : ''),
    )
    for (const s of result.sources) console.log(`[cron/collection-run] ${s.name}: ${s.outcome}`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/collection-run] failed:', err)
    return NextResponse.json({ error: 'collection run failed' }, { status: 500 })
  }
}
