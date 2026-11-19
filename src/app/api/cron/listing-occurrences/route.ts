import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { runOccurrences } from '@/lib/listings/occurrence-run'
import { occurrenceStore } from '@/lib/listings/occurrence-store'
import { dealVenuePhotos, venueMediaDeps } from '@/lib/venues/venue-images'
import { attachApprovedPhotos, selfListWaiting } from '@/lib/listings/self-listing-run'
import { sendSellThroughReports } from '@/lib/listings/sell-through-report'
import { notifyIndexNow } from '@/lib/seo/indexnow'
import { recordPhaseRun } from '@/lib/ops/phase-runs'
import { reverifyNights } from '@/lib/listings/reverify-run'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Vercel ends a function at its maximum duration: "If a function runs for
// longer than its set maximum duration, Vercel will terminate it", and with
// fluid compute the default is 300 s on every plan
// (https://vercel.com/docs/functions/configuring-functions/duration, read
// 24 October 2026). Declared here rather than inherited, and the run stops
// starting writes a minute inside it, so it is never ended part way.
export const maxDuration = 300
const RUN_BUDGET_MS = (maxDuration - 60) * 1000

/**
 * EVERY NIGHT KEEPS ITS NEXT 8 DATES (WI2 Part 1, docs/walk-in/WI2-PLAN.md section 7). Daily.
 *
 * Each EventLinqs listing's night is stored once with its rule; this makes the
 * dated walk-in events it is owed, brings future ones in line when the night
 * changed, and takes off a date that is no longer one of its dates (cancelled
 * when anyone asked to be reminded of it, deleted when nobody did). The rules
 * are in src/lib/listings/occurrence-plan.ts and occurrence-run.ts; the reads
 * and writes in occurrence-store.ts. One night failing never stops the rest:
 * each failure is logged here with its night, its date and its reason.
 *
 * DAILY, because a night is a calendar fact: the window moves one day at a
 * time, and an import (which writes nights) is followed by a run of its own.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const started = Date.now()
    const result = await runOccurrences(occurrenceStore(), new Date(started), { deadline: started + RUN_BUDGET_MS })
    console.log(
      `[cron/listing-occurrences] ${result.nights} nights: ${result.created} made, ${result.updated} changed, ` +
        `${result.cancelled} cancelled, ${result.deleted} deleted, ${result.unchanged} unchanged, ` +
        `${result.held.length} held, ${result.failed.length} failed` +
        (result.stoppedEarly ? `; stopped at its budget with ${result.nightsNotReached} nights not finished, the next run carries on` : ''),
    )
    for (const h of result.held) console.log(`[cron/listing-occurrences] held ${h.seriesId} ${h.date}: ${h.why}`)
    for (const f of result.failed) console.error(`[cron/listing-occurrences] failed ${f.seriesId} ${f.date ?? '(the night)'}: ${f.why}`)
    // NO PHOTO IS EVER REUSED (Lawal's ruling of 31 October 2026): the nights just made take their venue's photos, one
    // per night (the photo system's P3). A deal that fails is logged and never takes the nights' result down with it.
    let dealt: number | null = null
    try {
      dealt = await dealVenuePhotos(venueMediaDeps())
      console.log(`[cron/listing-occurrences] ${dealt} venue photo(s) dealt to nights`)
    } catch (error) {
      console.error('[cron/listing-occurrences] the venue photos were not dealt:', error instanceof Error ? error.message : error)
    }
    // ORGANISER SELF-LISTING'S BACKSTOP (Lawal's rulings of 8 November 2026, 07:01 and 07:05): a submission whose own
    // check never finished when it was sent is checked here, a few at a time, so none waits for a person. Skipped when
    // the run above used its budget; the next hour takes them.
    let selfListed: string[] = []
    if (!result.stoppedEarly && Date.now() < started + RUN_BUDGET_MS - 60_000) {
      try {
        selfListed = (await selfListWaiting(new Date())).map((o) => o.state)
        if (selfListed.length) console.log(`[cron/listing-occurrences] organiser submissions checked: ${selfListed.join(', ')}`)
        // A photo Lawal approved for a submission accepted before self-listing (the PM's 06:52), marked by a reviewed write.
        for (const line of await attachApprovedPhotos()) console.log(`[cron/listing-occurrences] approved photo: ${line}`)
      } catch (error) {
        console.error('[cron/listing-occurrences] the waiting submissions were not checked:', error instanceof Error ? error.message : error)
      }
    }
    // THE SELL-THROUGH REPORT (Lawal's ruling of 8 November 2026, 16:13, build 3): the day after a listed event ends, its
    // organiser hears what EventLinqs counted for it, once (src/lib/listings/sell-through-report.ts). Rides this run, so
    // no cron is added; skipped when the run is near its budget, and the next hour takes them.
    let reports: string[] = []
    if (!result.stoppedEarly && Date.now() < started + RUN_BUDGET_MS - 60_000) {
      try {
        reports = await sendSellThroughReports(new Date())
        for (const line of reports) console.log(`[cron/listing-occurrences] report: ${line}`)
      } catch (error) {
        console.error('[cron/listing-occurrences] the reports were not run:', error instanceof Error ? error.message : error)
      }
    }
    // THE ENGINE KEEPS ITS OWN NIGHTS TRUE, AND THE DAY OF CHECK (Lawal, 15 November 2026, 06:03 and 06:50; the PM's 07:00
    // item 4). In this hourly turn, with the time it has left and no new schedule (law 14 (d)): only the nights whose own
    // freshness tier is running out are read on their page (every night starting today between 03:00 and 06:00 Melbourne),
    // a disagreement held at once and its site's other nights read too (src/lib/listings/reverify-run.ts). A failure is
    // said and never fails the turn.
    let reverify = 'not this turn: too little of the function left'
    if (Date.now() < started + RUN_BUDGET_MS - 30_000) {
      try {
        const r = await reverifyNights(createAdminClient(), fetch, new Date(), started + RUN_BUDGET_MS)
        reverify =
          `${r.due} due, ${r.pages} page(s) read: ${r.agreed} agreed, ${r.held} held, ${r.unread} unread` +
          (r.marked ? `; ${r.marked} more read for a site that disagreed` : '') +
          (r.failed.length ? `; ${r.failed.length} failed` : '')
        for (const line of [...r.said, ...r.failed]) console.log(`[cron/listing-occurrences] re-read: ${line}`)
      } catch (error) {
        reverify = `the re-read failed: ${error instanceof Error ? error.message : String(error)}`
        console.error('[cron/listing-occurrences] the re-read failed:', error)
      }
      console.log(`[cron/listing-occurrences] re-read: ${reverify}`)
    }
    // INDEXNOW (the PM's order 3 of 11 November 2026, addition 3): last, after every write above, Bing and the engines
    // that share its notices hear which public event pages changed in the last 70 minutes (src/lib/seo/indexnow.ts).
    // One request with its own 15 s timeout, sent while the function still has time; it never throws.
    let indexNow = 'not sent: the run used its time'
    if (Date.now() < started + RUN_BUDGET_MS + 20_000) {
      indexNow = await notifyIndexNow(new Date())
      console.log(`[cron/listing-occurrences] IndexNow: ${indexNow}`)
    }
    // THE TIMETABLE'S COLLECT PHASE, MEASURED (the daily timetable, locked 20 November 2026; src/lib/ops/phase-runs.ts):
    // this run's nights as its units, and IndexNow's answer in its result, so both are read from production.
    await recordPhaseRun(createAdminClient(), {
      phase: 'collect',
      ride: 'listings',
      startedAt: new Date(started),
      endedAt: new Date(),
      units: result.nights,
      result: `${result.nights} nights, ${result.created} made, ${result.failed.length} failed; re-read: ${reverify}; IndexNow: ${indexNow}`,
      failed: result.failed.length > 0,
    })
    return NextResponse.json({ ok: true, ...result, dealt, selfListed, reports: reports.length, reverify, indexNow })
  } catch (err) {
    console.error('[cron/listing-occurrences] failed:', err)
    return NextResponse.json({ error: 'listing occurrences failed' }, { status: 500 })
  }
}
