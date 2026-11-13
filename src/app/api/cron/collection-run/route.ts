import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runCollection } from '@/lib/listings/collect-run'
import { collectionStore } from '@/lib/listings/collect-store'
import { runScout, SCOUT_HOUR, type ScoutOutcome } from '@/lib/listings/scout-engine'
import { scoutStore } from '@/lib/listings/scout-store'

export const dynamic = 'force-dynamic'

// Declared, as listing-occurrences does: Vercel ends a function at its maximum duration, 300 s by default with fluid
// compute (https://vercel.com/docs/functions/configuring-functions/duration). No source is started in the last minute.
export const maxDuration = 300
const RUN_BUDGET_MS = (maxDuration - 60) * 1000
/** The scout starts only with at least this much of the budget left, so the collection run is never cut short for it. */
const SCOUT_MIN_LEFT_MS = 90_000

const melbourneHour = (at: Date) =>
  Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' }).format(at))

/**
 * THE COLLECTION RUN (item 19; the engine plan of 28 October 2026, part A; src/lib/listings/collect.ts,
 * docs/walk-in/COLLECTION-RUN.md). Every hour at 25 past (Lawal, 1 November 2026, 16:13: this week first, changes
 * within the hour): a source holding nights in the next seven days is read each hour; every other source still only on
 * its own pace (daily, weekly, monthly or rarely).
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
        `${result.acceptedByRule} accepted by the partner rule, ${result.queued} for review; ${result.expired} passed night(s) taken out of the queue` +
        (result.notReached > 0 ? `; ${result.notReached} source(s) not reached inside the budget, still due` : ''),
    )
    for (const s of result.sources) console.log(`[cron/collection-run] ${s.name}: ${s.outcome}`)
    /* THE SCOUT RUNS ITSELF (src/lib/listings/scout-engine.ts; Lawal's 10:42 of 13 November 2026): once a night, in the
       05:25 turn and only with the budget the collection run left; no schedule is added. A failure never fails the run. */
    let scout: ScoutOutcome[] | string = 'not this turn: the scout runs in the 05:25 turn'
    if (melbourneHour(new Date(started)) === SCOUT_HOUR && started + RUN_BUDGET_MS - Date.now() >= SCOUT_MIN_LEFT_MS) {
      try {
        const db = createAdminClient()
        scout = await runScout(scoutStore(db), fetch, new Date(), started + RUN_BUDGET_MS)
        for (const o of scout) console.log(`[cron/collection-run] scout ${o.site}: ${o.outcome}`)
      } catch (err) {
        scout = `the scout failed: ${err instanceof Error ? err.message : String(err)}`
        console.error('[cron/collection-run] scout failed:', err)
      }
    }
    return NextResponse.json({ ok: true, ...result, scout })
  } catch (err) {
    console.error('[cron/collection-run] failed:', err)
    return NextResponse.json({ error: 'collection run failed' }, { status: 500 })
  }
}
