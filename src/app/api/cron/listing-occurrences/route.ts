import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { runOccurrences } from '@/lib/listings/occurrence-run'
import { occurrenceStore } from '@/lib/listings/occurrence-store'

export const dynamic = 'force-dynamic'

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
    const result = await runOccurrences(occurrenceStore(), new Date())
    console.log(
      `[cron/listing-occurrences] ${result.nights} nights: ${result.created} made, ${result.updated} changed, ` +
        `${result.cancelled} cancelled, ${result.deleted} deleted, ${result.unchanged} unchanged, ` +
        `${result.held.length} held, ${result.failed.length} failed`,
    )
    for (const h of result.held) console.log(`[cron/listing-occurrences] held ${h.seriesId} ${h.date}: ${h.why}`)
    for (const f of result.failed) console.error(`[cron/listing-occurrences] failed ${f.seriesId} ${f.date ?? '(the night)'}: ${f.why}`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/listing-occurrences] failed:', err)
    return NextResponse.json({ error: 'listing occurrences failed' }, { status: 500 })
  }
}
