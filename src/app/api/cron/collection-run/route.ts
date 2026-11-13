import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runCollection } from '@/lib/listings/collect-run'
import { collectionStore } from '@/lib/listings/collect-store'
import { runScout, SCOUT_HOUR, type ScoutOutcome } from '@/lib/listings/scout-engine'
import { scoutStore } from '@/lib/listings/scout-store'
import { attachOrganisers, type AttachOutcome } from '@/lib/listings/discovery-organisers'
import { discoveryDayStore } from '@/lib/listings/discovery-day-store'

export const dynamic = 'force-dynamic'

// Declared, as listing-occurrences does: Vercel ends a function at its maximum duration, 300 s by default with fluid
// compute (https://vercel.com/docs/functions/configuring-functions/duration). No source is started in the last minute.
export const maxDuration = 300
const RUN_BUDGET_MS = (maxDuration - 60) * 1000
/** The scout starts only with at least this much of the budget left, so the collection run is never cut short for it. */
const SCOUT_MIN_LEFT_MS = 90_000
/** The engine's own steps after the reads (its organisers, its day line) start only with this much of the function left. */
const ENGINE_MIN_LEFT_MS = 25_000

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
       23:25 turn and only with the budget the collection run left; no schedule is added. A failure never fails the run. */
    let scout: ScoutOutcome[] | string = 'not this turn: the scout runs in the 23:25 turn'
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
    /* THE EVENT DISCOVERY ENGINE'S OWN STEPS (Lawal's 18:28 and 18:31 of 13 November 2026), after the reads and inside the
       same function's time, each failure said and never failing the run: (d) every upcoming listing's venue gets its CRM
       organiser (src/lib/listings/discovery-organisers.ts); (f) the first turn of a day judges the day before from the
       engine's own records, and every turn adds its numbers to its own day's line (src/lib/listings/discovery-day.ts). */
    const end = started + maxDuration * 1000
    let organisers: AttachOutcome | string = 'not this turn: too little of the function left'
    let line: string = 'not this turn: too little of the function left'
    if (end - Date.now() >= ENGINE_MIN_LEFT_MS) {
      const db = createAdminClient()
      try {
        organisers = await attachOrganisers(db, new Date(), undefined, end - ENGINE_MIN_LEFT_MS / 2)
        console.log(`[cron/collection-run] organisers: ${organisers.attached} attached, ${organisers.entered} entered, ${organisers.left} left` +
          (organisers.failed.length > 0 ? `; ${organisers.failed.join('; ')}` : ''))
      } catch (err) {
        organisers = `the organisers step failed: ${err instanceof Error ? err.message : String(err)}`
        console.error('[cron/collection-run] organisers failed:', err)
      }
      try {
        const days = discoveryDayStore(db)
        const judged = await days.judgeYesterday(new Date())
        const scoutRan = Array.isArray(scout) ? { examined: scout.length, registered: scout.filter((o) => o.registered).length, errors: 0 }
          : scout.startsWith('the scout failed') ? { examined: 0, registered: 0, errors: 1 } : null
        await days.recordTurn(
          {
            at: new Date(started).toISOString(),
            read: result.read,
            landed: result.landed,
            acceptedByRule: result.acceptedByRule,
            queued: result.queued,
            failed: result.sources.filter((s) => s.outcome.startsWith('failed')).length,
            organisersAttached: typeof organisers === 'string' ? 0 : organisers.attached,
            scout: scoutRan,
          },
          new Date(started),
        )
        line = judged ? `judged ${judged.day}: ${judged.allPassed ? 'all PASS' : 'not all PASS'}, day ${judged.consecutiveDays} of 7; this turn recorded` : 'this turn recorded'
        console.log(`[cron/collection-run] the engine's day line: ${line}`)
      } catch (err) {
        line = `the day line failed: ${err instanceof Error ? err.message : String(err)}`
        console.error('[cron/collection-run] day line failed:', err)
      }
    }
    return NextResponse.json({ ok: true, ...result, scout, organisers, line })
  } catch (err) {
    console.error('[cron/collection-run] failed:', err)
    return NextResponse.json({ error: 'collection run failed' }, { status: 500 })
  }
}
