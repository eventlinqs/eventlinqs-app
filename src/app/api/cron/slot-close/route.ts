import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { recordClosedSlots } from '@/lib/ledger/adapter'

export const dynamic = 'force-dynamic'

/**
 * Cron route: runs once an hour via Vercel Crons.
 *
 * THE CLOSING ROW. Close-out D1 asks for "one row per event at close: final
 * sold, final revenue, fill percentage, scanned, no shows". This writes it, once
 * per slot, after the slot is over.
 *
 * WHY IT IS RECORDED RATHER THAN COMPUTED ON DEMAND. A figure recomputed in 2029
 * from tables that have moved on is an opinion formed afterwards, not a record
 * of what happened. Tiers get renamed, events get archived, and a fill
 * percentage that changes depending on when you ask it is worth nothing.
 *
 * Idempotent per slot on the occurrence key, so re-running it costs one read and
 * writes nothing. Bounded per run, so a backlog is worked through over several
 * ticks rather than in one request that times out.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const result = await recordClosedSlots()
    console.log(`[cron/slot-close] closed ${result.closed} of ${result.considered} slot(s) considered`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/slot-close] failed:', err)
    return NextResponse.json({ error: 'slot close failed' }, { status: 500 })
  }
}
